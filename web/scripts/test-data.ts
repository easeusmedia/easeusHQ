// Test data for trying every case by hand, in the one live database.
//   node --env-file=.env scripts/run.cjs scripts/test-data.ts add
//   node --env-file=.env scripts/run.cjs scripts/test-data.ts remove
// Everything is labelled: a "Test client", people named "Test …" with
// @example.com emails (they can't sign in; use View as), and task titles
// starting "[Test]". Overdue notices go only to the test people and
// Abhishek, and each overdue task is marked as already counted, so the
// nightly check never tells anyone real about them. "add" clears the old
// set first.
import { prisma } from "../src/lib/prisma";
import { addDays, dayOf } from "../src/lib/editorKpi";
import { ordinal } from "../src/lib/overdue";
import { deleteWithRecord } from "../src/lib/taskTrack";

const EMAIL = "@example.com";
const SLUG = "test-client";
const TITLE = "[Test]";

async function remove() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const tasks = await prisma.task.findMany({ where: { OR: [{ project: { client: { slug: SLUG } } }, { title: { startsWith: TITLE } }] }, select: { id: true } });
  const todos = await prisma.workTask.findMany({ where: { OR: [{ title: { startsWith: TITLE } }, { assignedToId: { in: userIds } }, { createdById: { in: userIds } }] }, select: { id: true } });
  const taskIds = tasks.map((t) => t.id);
  const todoIds = todos.map((t) => t.id);
  await prisma.notice.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { workTaskId: { in: todoIds } }, { forId: { in: userIds } }, { body: { contains: TITLE } }] } });
  await prisma.feedback.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.workTask.deleteMany({ where: { id: { in: todoIds } } });
  await prisma.deletedTask.deleteMany({ where: { title: { startsWith: TITLE } } });
  await prisma.project.deleteMany({ where: { client: { slug: SLUG } } });
  await prisma.client.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`Removed ${userIds.length} test people, ${taskIds.length} client tasks, ${todoIds.length} to-dos.`);
}

async function add() {
  await remove();
  const today = dayOf(new Date());
  const day = (n: number) => new Date(addDays(today, n));
  const [teams, titles, me] = await Promise.all([
    prisma.team.findMany({ select: { id: true, slug: true } }),
    prisma.jobTitle.findMany({ select: { id: true, name: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: "abhishek@easeus.media" }, select: { id: true, name: true } }),
  ]);
  const team = (slug: string) => teams.find((t) => t.slug === slug)!.id;
  const role = (name: string) => titles.find((t) => t.name === name)?.id;

  const person = (name: string, level: "core" | "employee", depts: string[], roles: string[]) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${EMAIL}`,
        role: level,
        teamId: team(depts[0]),
        departments: { connect: depts.map((d) => ({ id: team(d) })) },
        roles: { connect: roles.flatMap((r) => (role(r) ? [{ id: role(r)! }] : [])) },
      },
      select: { id: true, name: true },
    });
  const lead = await person("Test Lead", "core", ["production", "content"], ["Senior Video Editor"]);
  const editor = await person("Test Editor", "employee", ["production"], ["Video Editor"]);
  const designer = await person("Test Designer", "employee", ["production"], ["Graphic Designer"]);
  const writer = await person("Test Writer", "employee", ["content"], ["Scriptwriter"]);
  const seller = await person("Test Seller", "employee", ["sales"], ["Sales Representative"]);

  const client = await prisma.client.create({ data: { name: "Test client", slug: SLUG } });
  const reels = await prisma.project.create({ data: { clientId: client.id, name: "Test reels", type: "Reels" } });
  const designs = await prisma.project.create({ data: { clientId: client.id, name: "Test designs", type: "Design" } });

  type Status = "queued" | "editing" | "sent_for_approval" | "sent_for_client_approval" | "revision_requested" | "final_export_ready" | "delivered_and_uploaded";
  const job = (title: string, status: Status, who: { id: string }, due: number | null, more: Record<string, unknown> = {}) =>
    prisma.task.create({
      data: {
        title: `${TITLE} ${title}`,
        status,
        workflow: "video",
        projectId: reels.id,
        assignedToId: who.id,
        teamId: team("production"),
        createdById: me.id,
        dueDate: due === null ? null : day(due),
        deliveryDate: due === null ? null : day(due + 3),
        ...more,
      },
    });
  // a task past its date n times: already counted, so the nightly check leaves it
  const missed = (due: number, strikes: number) => ({ strikes, overdueFor: day(due) });
  const handedOff = { handedOffAt: day(-1) };

  // Production, video
  await job("Reel 1, queued", "queued", editor, 2);
  await job("Reel 2, due today", "editing", editor, 0);
  const miss1 = await job("Reel 3, 1st miss", "sent_for_approval", editor, -2, missed(-2, 1));
  const miss2 = await job("Reel 4, 2nd miss after a date move", "revision_requested", editor, -1, missed(-1, 2));
  const miss3 = await job("Reel 5, 3rd miss", "editing", editor, -3, missed(-3, 3));
  await job("Reel 6, with the client", "sent_for_client_approval", editor, -1, handedOff);
  await job("Reel 7, final export ready", "final_export_ready", editor, -2, handedOff);
  const shared = await job("Reel 8, shared with the designer", "editing", editor, 1);
  await job("Reel 9, scheduled for next week", "queued", editor, 9, { scheduledFor: day(7) });
  await job("Reel 0, delivered", "delivered_and_uploaded", editor, -5, handedOff);
  const leadMiss = await job("Podcast cut, Level 2 2nd miss", "editing", lead, -1, missed(-1, 2));
  const toDelete = await job("Reel to delete", "queued", editor, 4);

  // Production, design
  const design = (title: string, status: Status, due: number, more: Record<string, unknown> = {}) => job(title, status, designer, due, { workflow: "design", projectId: designs.id, ...more });
  await design("Thumbnail set, queued", "queued", 3);
  await design("Carousel, in progress", "editing", 1);
  await design("Banner, sent for approval", "sent_for_approval", 0);
  const designMiss = await design("Poster, revision requested, 1st miss", "revision_requested", -1, missed(-1, 1));
  await design("Logo files, final export ready", "final_export_ready", -2, handedOff);

  // to-dos everywhere else
  type TodoStatus = "todo" | "in_progress" | "in_review" | "done";
  const todo = (title: string, status: TodoStatus, who: { id: string }, dept: string, due: number | null, more: Record<string, unknown> = {}) =>
    prisma.workTask.create({
      data: { title: `${TITLE} ${title}`, status, assignedToId: who.id, createdById: me.id, teamId: team(dept), dueDate: due === null ? null : day(due), ...more },
    });
  const script = await todo("Script for Reel 10", "todo", writer, "content", 1, { projectId: reels.id });
  await todo("Hook ideas for October", "in_progress", writer, "content", 0, { projectId: reels.id });
  const todoMiss = await todo("Content calendar, 1st miss", "todo", writer, "content", -2, missed(-2, 1));
  await todo("Call five leads", "todo", seller, "sales", 0);
  await todo("Proposal for a new client", "in_review", seller, "sales", 3);
  await todo("Follow-up emails, no date", "todo", seller, "sales", null);
  await todo("Weekly review with the editors", "todo", lead, "production", 2);
  await todo("Check every view with View as", "todo", me, "production", 0);
  await todo("Brief for the test client", "in_progress", me, "client-services", 1, { projectId: reels.id });
  const todoToDelete = await todo("To-do to delete", "todo", writer, "content", 2);

  // completion date moves, with reasons
  await prisma.taskDateChange.createMany({
    data: [
      { taskId: miss2.id, from: day(-4), to: day(-1), reason: "The client sent the footage three days late.", byId: lead.id, strike: 1 },
      { taskId: miss3.id, from: day(-9), to: day(-6), reason: "Waiting on the voiceover.", byId: editor.id, strike: 1 },
      { taskId: miss3.id, from: day(-6), to: day(-3), reason: "The client changed the script.", byId: lead.id, strike: 2 },
    ],
  });

  // people brought onto tasks, with reasons
  await prisma.taskShare.createMany({
    data: [
      { taskId: shared.id, userId: designer.id, byId: lead.id, reason: "It needs a matching thumbnail." },
      { workTaskId: script.id, userId: editor.id, byId: writer.id, reason: "You'll edit this one, so read the script early." },
    ],
  });

  // the notices the rules would send (lib/overdue.ts), to test people and Abhishek only
  const overdue = (ref: { taskId?: string; workTaskId?: string }, title: string, owner: { id: string; name: string }, strike: number, others: { id: string }[]) => [
    { ...ref, forId: owner.id, kind: "overdue", body: `"${TITLE} ${title}" is past its completion date (${ordinal(strike)} time). Set a new date and say why.` },
    ...others.map((p) => ({ ...ref, forId: p.id, kind: "overdue", body: `"${TITLE} ${title}" (${owner.name}) is past its completion date, the ${ordinal(strike)} time.` })),
  ];
  await prisma.notice.createMany({
    data: [
      ...overdue({ taskId: miss1.id }, "Reel 3, 1st miss", editor, 1, [lead]),
      ...overdue({ taskId: miss2.id }, "Reel 4, 2nd miss after a date move", editor, 2, [lead]),
      ...overdue({ taskId: miss3.id }, "Reel 5, 3rd miss", editor, 3, [lead, me]),
      ...overdue({ taskId: leadMiss.id }, "Podcast cut, Level 2 2nd miss", lead, 2, [me]),
      ...overdue({ taskId: designMiss.id }, "Poster, revision requested, 1st miss", designer, 1, [lead]),
      ...overdue({ workTaskId: todoMiss.id }, "Content calendar, 1st miss", writer, 1, [lead]),
      { taskId: shared.id, forId: designer.id, kind: "shared", by: lead.name, body: `${lead.name} added you to "${TITLE} Reel 8, shared with the designer": It needs a matching thumbnail.` },
      { workTaskId: script.id, forId: editor.id, kind: "shared", by: writer.name, body: `${writer.name} added you to "${TITLE} Script for Reel 10": You'll edit this one, so read the script early.` },
    ],
  });

  // one of each kind deleted, kept in History with the reason
  await deleteWithRecord({ kind: "task", id: toDelete.id }, "The client cancelled this reel.", me);
  await deleteWithRecord({ kind: "work", id: todoToDelete.id }, "Made by mistake.", me);

  console.log("Added 5 test people, a Test client, 17 client tasks and 10 to-dos (one of each then deleted), date moves, shares and notices.");
}

const mode = process.argv[3]; // argv[2] is this script, passed by run.cjs
await (mode === "add" ? add() : mode === "remove" ? remove() : Promise.reject(new Error("Say add or remove.")));
await prisma.$disconnect();
