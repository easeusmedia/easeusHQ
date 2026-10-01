// Sample data for trying every case by hand, in the one live database.
//   node --env-file=.env scripts/run.cjs scripts/test-data.ts add
//   node --env-file=.env scripts/run.cjs scripts/test-data.ts remove
// Three sample clients (slugs start "sample-") and eight sample people
// (@example.com, they can't sign in: use View as), with a past: every task
// has its stage history, and missed due dates are counted by the real
// overdue check, round by round, so the strikes and notices are exactly
// what the rules send (lib/overdue.ts), to real Level 1 and 2 included.
// Every date move has its reason. "add" clears the old set first; "remove"
// takes away all of it, notices included.
import { prisma } from "../src/lib/prisma";
import { addDays, dayOf } from "../src/lib/editorKpi";
import { stageChangeAction } from "../src/lib/stages";
import { deleteWithRecord, recordDateChange, sweepOverdue, type TaskRef } from "../src/lib/taskTrack";

const EMAIL = "@example.com";
const SLUG = "sample-";

async function remove() {
  const users = (await prisma.user.findMany({ where: { email: { endsWith: EMAIL } }, select: { id: true } })).map((u) => u.id);
  const sampleClient = { OR: [{ slug: { startsWith: SLUG } }, { slug: "test-client" }] };
  const tasks = (await prisma.task.findMany({ where: { OR: [{ project: { client: sampleClient } }, { title: { startsWith: "[Test]" } }] }, select: { id: true } })).map((t) => t.id);
  const todos = (
    await prisma.workTask.findMany({
      where: { OR: [{ project: { client: sampleClient } }, { title: { startsWith: "[Test]" } }, { assignedToId: { in: users } }, { createdById: { in: users } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  await prisma.notice.deleteMany({ where: { OR: [{ taskId: { in: tasks } }, { workTaskId: { in: todos } }, { forId: { in: users } }, { body: { contains: "[Test]" } }] } });
  await prisma.activityLog.deleteMany({ where: { OR: [{ entityId: { in: [...tasks, ...todos] } }, { actorId: { in: users } }] } });
  await prisma.feedback.deleteMany({ where: { OR: [{ taskId: { in: tasks } }, { authorId: { in: users } }] } });
  await prisma.task.deleteMany({ where: { id: { in: tasks } } });
  await prisma.workTask.deleteMany({ where: { id: { in: todos } } });
  await prisma.deletedTask.deleteMany({ where: { OR: [{ byId: { in: users } }, { title: { startsWith: "[Test]" } }] } });
  await prisma.project.deleteMany({ where: { client: sampleClient } });
  await prisma.client.deleteMany({ where: sampleClient });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  console.log(`Removed ${users.length} sample people, ${tasks.length} client tasks and ${todos.length} to-dos.`);
}

async function add() {
  await remove();
  const today = dayOf(new Date());
  const day = (n: number) => new Date(addDays(today, n));
  // a moment n days from today, at an hour in IST
  const at = (n: number, hour = 11) => new Date(`${addDays(today, n)}T${String(hour).padStart(2, "0")}:${String((hour * 7) % 60).padStart(2, "0")}:00+05:30`);

  const [teams, roles, tags, me] = await Promise.all([
    prisma.team.findMany({ select: { id: true, slug: true } }),
    prisma.jobTitle.findMany({ select: { id: true, name: true } }),
    prisma.taskTag.findMany({ select: { id: true, name: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: "abhishek@easeus.media" }, select: { id: true, name: true } }),
  ]);
  const team = (slug: string) => teams.find((t) => t.slug === slug)!.id;
  const tag = (name: string) => tags.find((t) => t.name === name)!.id;

  // ---------- people ----------
  const person = (name: string, level: "core" | "employee", position: string, depts: string[], roleNames: string[], joined: number) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${EMAIL}`,
        role: level,
        position,
        teamId: team(depts[0]),
        joinedAt: day(joined),
        departments: { connect: depts.map((d) => ({ id: team(d) })) },
        roles: { connect: roleNames.flatMap((r) => roles.filter((x) => x.name === r).map((x) => ({ id: x.id }))) },
      },
      select: { id: true, name: true },
    });
  const riya = await person("Riya Kapoor", "core", "Post-production Lead", ["production"], ["Senior Video Editor"], -420);
  const aditi = await person("Aditi Rao", "core", "Content Lead", ["content"], ["Content Strategist"], -380);
  const karan = await person("Karan Malhotra", "employee", "Video Editor", ["production"], ["Video Editor"], -200);
  const ishaan = await person("Ishaan Gupta", "employee", "Video Editor", ["production"], ["Video Editor"], -95);
  const sneha = await person("Sneha Iyer", "employee", "Graphic Designer", ["production"], ["Graphic Designer"], -150);
  const aman = await person("Aman Verma", "employee", "Scriptwriter", ["content"], ["Scriptwriter"], -120);
  const neha = await person("Neha Joshi", "employee", "Sales Executive", ["sales"], ["Sales Representative"], -60);
  const tanvi = await person("Tanvi Desai", "employee", "Social Media Manager", ["distribution"], ["Social Media Manager"], -240);

  // ---------- clients ----------
  const client = (name: string, slug: string, niche: string) => prisma.client.create({ data: { name, slug: SLUG + slug, niche } });
  const project = (clientId: string, name: string, type: string) => prisma.project.create({ data: { clientId, name, type } });
  const glow = await client("Glow Derma Clinic", "glow-derma", "Dermatology");
  const kavya = await client("Dr Kavya Rao", "kavya-rao", "Gynaecology");
  const fitfuel = await client("FitFuel Nutrition", "fitfuel", "Nutrition");
  const glowReels = await project(glow.id, "October reels", "reels");
  const glowPodcast = await project(glow.id, "Skin Talk podcast", "podcast");
  const kavyaShorts = await project(kavya.id, "October short-form", "short-form");
  const fitAds = await project(fitfuel.id, "Launch campaign", "ads");
  const fitDesign = await project(fitfuel.id, "Brand creatives", "Design");

  // ---------- client work, with its past ----------
  type Stage = "queued" | "editing" | "sent_for_approval" | "sent_for_client_approval" | "revision_requested" | "final_export_ready" | "delivered_and_uploaded";
  const PATH: Record<Stage, Stage[]> = {
    queued: [],
    editing: ["editing"],
    sent_for_approval: ["editing", "sent_for_approval"],
    revision_requested: ["editing", "sent_for_approval", "revision_requested"],
    sent_for_client_approval: ["editing", "sent_for_approval", "sent_for_client_approval"],
    final_export_ready: ["editing", "sent_for_approval", "sent_for_client_approval", "final_export_ready"],
    delivered_and_uploaded: ["editing", "sent_for_approval", "sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"],
  };
  // who makes each move: the person on it hands in; the lead reviews
  const LEAD_MOVES: Stage[] = ["revision_requested", "sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

  type Move = { to: number; reason: string; by: { id: string } };
  type Job = {
    title: string;
    kind: string;
    status: Stage;
    who: { id: string };
    lead: { id: string };
    project: { id: string };
    created: number;
    // the first due date, and each new one after a miss
    due: number;
    moves?: Move[];
    delivery?: number;
    design?: boolean;
    handedOff?: number;
    scheduled?: number;
    review?: string;
  };
  const dated: { ref: TaskRef; due: number; moves: Move[] }[] = [];

  async function job(j: Job) {
    const steps = PATH[j.status];
    const t = await prisma.task.create({
      data: {
        title: j.title,
        status: j.status,
        workflow: j.design ? "design" : "video",
        projectId: j.project.id,
        assignedToId: j.who.id,
        teamId: team("production"),
        createdById: j.lead.id,
        createdAt: at(j.created, 10),
        dueDate: day(j.due),
        deliveryDate: j.delivery === undefined ? null : day(j.delivery),
        handedOffAt: j.handedOff === undefined ? null : at(j.handedOff, 17),
        scheduledFor: j.scheduled === undefined ? null : day(j.scheduled),
        revisionCount: steps.filter((s) => s === "revision_requested").length,
        reviewNotes: j.review ?? null,
        reviewedById: j.review ? j.lead.id : null,
        tags: { connect: [{ id: tag(j.kind) }] },
      },
    });
    // its history: made, then each move, spread evenly from then until today
    const span = -j.created;
    await prisma.activityLog.createMany({
      data: [
        { actorId: j.lead.id, action: "created", entity: "Task", entityId: t.id, createdAt: at(j.created, 10) },
        ...steps.map((to, i) => ({
          actorId: LEAD_MOVES.includes(to) ? j.lead.id : j.who.id,
          action: stageChangeAction(i ? steps[i - 1] : "queued", to),
          entity: "Task",
          entityId: t.id,
          createdAt: at(j.created + Math.round(((i + 1) * span) / (steps.length + 1)), 12 + i),
        })),
      ],
    });
    if (j.review) await prisma.feedback.create({ data: { taskId: t.id, authorId: j.lead.id, body: j.review, createdAt: at(-1, 16) } });
    dated.push({ ref: { kind: "task", id: t.id }, due: j.due, moves: j.moves ?? [] });
    return t;
  }

  // Production: video
  await job({ title: "Glow Derma - Acne Myths Busted", kind: "Reel", status: "sent_for_approval", who: karan, lead: riya, project: glowReels, created: -6, due: -2, delivery: 2 });
  await job({
    title: "Glow Derma - Laser Hair Removal FAQ",
    kind: "Reel",
    status: "revision_requested",
    who: karan,
    lead: riya,
    project: glowReels,
    created: -12,
    due: -9,
    delivery: 1,
    moves: [
      { to: -5, reason: "The clinic sent the before and after photos four days late.", by: karan },
      { to: -2, reason: "The client asked for a new hook after seeing the first cut.", by: riya },
    ],
    review: "Open on the before and after, not the doctor. Captions are a beat late from 0:12.",
  });
  const peel = await job({
    title: "Glow Derma - Chemical Peel Aftercare",
    kind: "Reel",
    status: "editing",
    who: ishaan,
    lead: riya,
    project: glowReels,
    created: -9,
    due: -6,
    delivery: 2,
    moves: [{ to: -2, reason: "Waiting on the doctor's voiceover, recorded on Monday.", by: ishaan }],
  });
  await job({
    title: "Skin Talk - Ep 12 Full Episode",
    kind: "Podcast editing",
    status: "editing",
    who: riya,
    lead: riya,
    project: glowPodcast,
    created: -10,
    due: -6,
    delivery: 3,
    moves: [{ to: -2, reason: "The guest mic drifted out of sync and needed a full re-sync.", by: riya }],
  });
  await job({
    title: "Dr Kavya Rao - Monthly Highlights",
    kind: "Reel",
    status: "editing",
    who: riya,
    lead: riya,
    project: kavyaShorts,
    created: -7,
    due: -3,
    delivery: 4,
    moves: [{ to: 1, reason: "The doctor moved the clinic shoot to Wednesday.", by: riya }],
  });
  await job({ title: "Dr Kavya Rao - PCOS Diet Tips", kind: "Reel", status: "editing", who: ishaan, lead: riya, project: kavyaShorts, created: -3, due: 0, delivery: 3 });
  await job({ title: "Dr Kavya Rao - First Trimester Do's and Don'ts", kind: "Reel", status: "sent_for_approval", who: karan, lead: riya, project: kavyaShorts, created: -4, due: 0, delivery: 2 });
  await job({ title: "Dr Kavya Rao - Myths About C-Sections", kind: "Reel", status: "sent_for_client_approval", who: karan, lead: riya, project: kavyaShorts, created: -7, due: -2, delivery: 1, handedOff: -2 });
  await job({ title: "Dr Kavya Rao - Fertility Q&A Trailer", kind: "Trailer", status: "final_export_ready", who: ishaan, lead: riya, project: kavyaShorts, created: -9, due: -3, delivery: 0, handedOff: -3 });
  await job({ title: "Glow Derma - Sunscreen Reapplication", kind: "Reel", status: "delivered_and_uploaded", who: karan, lead: riya, project: glowReels, created: -14, due: -9, delivery: -6, handedOff: -9 });
  const ad = await job({ title: "FitFuel - Protein Myths Ad", kind: "Reel", status: "queued", who: ishaan, lead: riya, project: fitAds, created: -1, due: 2, delivery: 5 });
  await job({ title: "FitFuel - Founder Story Ad", kind: "Reel", status: "queued", who: karan, lead: riya, project: fitAds, created: -1, due: 6, delivery: 9, scheduled: 4 });
  const teaser = await job({ title: "Glow Derma - Diwali Offer Teaser", kind: "Reel", status: "queued", who: ishaan, lead: riya, project: glowReels, created: -5, due: 4, delivery: 6 });

  // Production: design
  const design = (j: Omit<Job, "who" | "lead" | "design">) => job({ ...j, who: sneha, lead: riya, design: true });
  await design({ title: "Skin Talk - Ep 12 Thumbnail", kind: "Thumbnail", status: "queued", project: glowPodcast, created: -2, due: 1, delivery: 3 });
  await design({ title: "FitFuel - Launch Carousel", kind: "Graphic", status: "editing", project: fitDesign, created: -4, due: 0, delivery: 2 });
  await design({ title: "Dr Kavya Rao - October Story Templates", kind: "Graphic", status: "sent_for_approval", project: kavyaShorts, created: -5, due: -1, delivery: 2 });
  await design({
    title: "FitFuel - Product Label Mockups",
    kind: "Graphic",
    status: "revision_requested",
    project: fitDesign,
    created: -8,
    due: -5,
    delivery: 1,
    moves: [{ to: -1, reason: "FitFuel changed their brand colours midway.", by: sneha }],
    review: "Use the new green and give the logo more room at the top.",
  });
  await design({ title: "Glow Derma - Clinic Banner", kind: "Graphic", status: "final_export_ready", project: glowReels, created: -6, due: -2, delivery: 0, handedOff: -2 });

  // ---------- to-dos everywhere else ----------
  type Todo = {
    title: string;
    status: "todo" | "in_progress" | "in_review" | "done";
    who: { id: string };
    by: { id: string };
    dept: string;
    created: number;
    due: number;
    moves?: Move[];
    project?: { id: string };
    notes?: string;
  };
  async function todo(t: Todo) {
    const w = await prisma.workTask.create({
      data: {
        title: t.title,
        status: t.status,
        assignedToId: t.who.id,
        createdById: t.by.id,
        teamId: team(t.dept),
        projectId: t.project?.id ?? null,
        notes: t.notes ?? null,
        createdAt: at(t.created, 9),
        dueDate: day(t.due),
        completedAt: t.status === "done" ? at(-1, 18) : null,
      },
    });
    dated.push({ ref: { kind: "work", id: w.id }, due: t.due, moves: t.moves ?? [] });
    return w;
  }
  const script = await todo({
    title: "Script: PCOS Diet Tips",
    status: "in_progress",
    who: aman,
    by: aditi,
    dept: "content",
    created: -4,
    due: 1,
    project: kavyaShorts,
    notes: "Three tips, each under 10 seconds. The doctor wants to mention the free consult.",
  });
  await todo({ title: "Hooks for Glow Derma's November reels", status: "todo", who: aman, by: aditi, dept: "content", created: -2, due: 0, project: glowReels });
  await todo({
    title: "Content calendar for November",
    status: "in_progress",
    who: aman,
    by: aditi,
    dept: "content",
    created: -10,
    due: -6,
    moves: [{ to: -2, reason: "Waiting on the clinic's list of festival offers.", by: aman }],
  });
  await todo({ title: "Review October scripts", status: "in_progress", who: aditi, by: aditi, dept: "content", created: -6, due: -2 });
  await todo({ title: "Plan Diwali content for Glow Derma", status: "todo", who: aditi, by: aditi, dept: "content", created: -1, due: 3, project: glowReels });
  await todo({ title: "Discovery call: Smile Dental Studio", status: "todo", who: neha, by: neha, dept: "sales", created: -2, due: 0 });
  await todo({ title: "Proposal for Urban Yoga Co", status: "in_review", who: neha, by: neha, dept: "sales", created: -5, due: 2 });
  await todo({ title: "Follow up with the five leads from the wellness expo", status: "todo", who: neha, by: neha, dept: "sales", created: -7, due: -2 });
  await todo({ title: "Schedule Glow Derma's reels for the week", status: "todo", who: tanvi, by: tanvi, dept: "distribution", created: -1, due: 0, project: glowReels });
  await todo({ title: "Upload Skin Talk Ep 11 to YouTube", status: "done", who: tanvi, by: tanvi, dept: "distribution", created: -4, due: -1, project: glowPodcast });
  await todo({ title: "Brief Riya on the FitFuel launch", status: "in_progress", who: me, by: me, dept: "client-services", created: -1, due: 1, project: fitAds });
  await todo({ title: "Check FitFuel's ad copy with the client", status: "todo", who: me, by: me, dept: "client-services", created: 0, due: 0, project: fitAds });
  const dupe = await todo({ title: "Content calendar for November (copy)", status: "todo", who: aman, by: aditi, dept: "content", created: -3, due: 5 });

  // ---------- missed dates, counted by the real check, round by round ----------
  // Round n: everything past its date gets its nth strike and the rules'
  // notices (dated the morning after the miss); then each task with an nth
  // move gets its new date and reason, made the day after it was missed.
  for (let round = 0; round < 3; round++) {
    const started = new Date();
    await sweepOverdue();
    for (const d of dated) {
      const due = round === 0 ? d.due : d.moves[round - 1]?.to;
      if (due === undefined) continue;
      const key = d.ref.kind === "task" ? { taskId: d.ref.id } : { workTaskId: d.ref.id };
      await prisma.notice.updateMany({ where: { ...key, createdAt: { gte: started } }, data: { createdAt: at(due + 1, 9) } });
      const move = d.moves[round];
      if (!move) continue;
      const row = d.ref.kind === "task" ? await prisma.task.findUniqueOrThrow({ where: { id: d.ref.id } }) : await prisma.workTask.findUniqueOrThrow({ where: { id: d.ref.id } });
      await recordDateChange(d.ref, row.dueDate, day(move.to), move.reason, move.by.id, row.strikes);
      const last = await prisma.taskDateChange.findFirstOrThrow({ where: key, orderBy: { createdAt: "desc" } });
      await prisma.taskDateChange.update({ where: { id: last.id }, data: { createdAt: at(due + 1, 10) } });
      if (d.ref.kind === "task") await prisma.task.update({ where: { id: d.ref.id }, data: { dueDate: day(move.to) } });
      else await prisma.workTask.update({ where: { id: d.ref.id }, data: { dueDate: day(move.to) } });
    }
  }

  // ---------- people brought on, with reasons ----------
  const share = async (ref: TaskRef, title: string, who: { id: string }, by: { id: string; name: string }, reason: string, when: number) => {
    const key = ref.kind === "task" ? { taskId: ref.id } : { workTaskId: ref.id };
    await prisma.taskShare.create({ data: { ...key, userId: who.id, byId: by.id, reason, createdAt: at(when, 15) } });
    await prisma.notice.create({ data: { ...key, forId: who.id, kind: "shared", by: by.name, body: `${by.name} added you to "${title}": ${reason}`, createdAt: at(when, 15) } });
  };
  await share({ kind: "task", id: ad.id }, ad.title, sneha, riya, "It needs a thumbnail that matches the ad's first frame.", -1);
  await share({ kind: "work", id: script.id }, script.title, ishaan, aditi, "You'll edit this one, so read the script before the shoot.", -2);
  await share({ kind: "task", id: peel.id }, peel.title, karan, riya, "Ishaan is behind; take the captions and the B-roll.", -1);

  // ---------- deleted, kept in History ----------
  await deleteWithRecord({ kind: "task", id: teaser.id }, "Glow Derma dropped the Diwali campaign.", riya);
  await deleteWithRecord({ kind: "work", id: dupe.id }, "Duplicate", aditi);

  const notices = await prisma.notice.groupBy({ by: ["forId"], where: { kind: "overdue", OR: [{ taskId: { in: dated.map((d) => d.ref.id) } }, { workTaskId: { in: dated.map((d) => d.ref.id) } }] }, _count: true });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: notices.map((n) => n.forId!) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  console.log("Overdue notices sent:", notices.map((n) => `${names.get(n.forId!)} ${n._count}`).join(", "));
}

const mode = process.argv[3]; // argv[2] is this script, passed by run.cjs
await (mode === "add" ? add() : mode === "remove" ? remove() : Promise.reject(new Error("Say add or remove.")));
await prisma.$disconnect();
