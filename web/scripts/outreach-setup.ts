// Sales > Outreach > Podcast, with Notion's Dream 156 board, in the one live
// database; plus a few sample leads copied from Notion to try it with.
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts setup
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts sample <json>
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts remove-sample <json>
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts tidy
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts messages
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts sync
//   node --env-file=.env scripts/run.cjs scripts/outreach-setup.ts split
// tidy trims a board first copied whole from Notion to what outreach uses;
// messages puts the sequence's messages on any stage that has none;
// sync rewrites every stage's messages from the sequence; split makes a
// day sent on two platforms into one stage per platform.
// setup can run again safely: a page already there (same parent and slug) is
// left exactly as it is, so nobody's edits are undone. sample skips a lead
// whose title is already on the board; remove-sample deletes only the copies it made.
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SEQUENCE } from "./outreach-sequence";
import { cleanValue, DREAM_156, slugify, type ChannelKind, type FieldKind, type SpaceKind } from "@/lib/space";

const ME = "abhishek@easeus.media";

type Sample = {
  title: string;
  stage: string;
  assignedTo: string | null;
  // by property name; a tag by its exact name
  values: Record<string, unknown>;
  contacts: { name: string; role: string; channels: { kind: ChannelKind; value: string }[] }[];
  links: { label: string; url: string }[];
  notes: string;
};

const salesTeam = () => prisma.team.findUniqueOrThrow({ where: { slug: "sales" }, select: { id: true } });

// A page under its parent, made if missing. A new board gets its stages and
// properties in the same transaction, so a board that exists is complete.
async function ensure(teamId: string, parentId: string | null, kind: SpaceKind, name: string, createdById: string | null, fill?: (tx: Prisma.TransactionClient, id: string) => Promise<void>) {
  const slug = slugify(name);
  const found = await prisma.space.findFirst({ where: { teamId, parentId, slug }, select: { id: true, kind: true, name: true } });
  if (found) {
    if (found.kind !== kind) throw new Error(`"${found.name}" (/${slug}) is a ${found.kind}, not a ${kind}. Nothing was changed.`);
    console.log(`Already there: ${kind} "${found.name}"`);
    return found.id;
  }
  const last = await prisma.space.aggregate({ where: { teamId, parentId }, _max: { sortOrder: true } });
  const id = await prisma.$transaction(
    async (tx) => {
      const made = await tx.space.create({ data: { teamId, parentId, kind, name, slug, sortOrder: Math.max(0, last._max.sortOrder ?? 0) + 1, createdById }, select: { id: true } });
      await fill?.(tx, made.id);
      return made.id;
    },
    { timeout: 30_000 },
  );
  console.log(`Created: ${kind} "${name}"`);
  return id;
}

async function setup() {
  const team = await salesTeam();
  const me = await prisma.user.findUnique({ where: { email: ME }, select: { id: true } });
  const section = await ensure(team.id, null, "section", "Outreach", me?.id ?? null);
  const portal = await ensure(team.id, section, "portal", "Podcast", me?.id ?? null);
  await ensure(team.id, portal, "board", DREAM_156.name, me?.id ?? null, async (tx, boardId) => {
    await tx.boardStage.createMany({ data: DREAM_156.stages.map((s, i) => ({ boardId, name: s.name, color: s.color, sortOrder: i + 1 })) });
    for (const [i, f] of DREAM_156.fields.entries()) {
      const field = await tx.boardField.create({ data: { boardId, name: f.name, kind: f.kind, onCard: !!f.onCard, required: !!f.required, sortOrder: i + 1 }, select: { id: true } });
      if (f.options?.length) await tx.fieldOption.createMany({ data: f.options.map((o, j) => ({ fieldId: field.id, name: o.name, color: o.color, sortOrder: j + 1 })) });
    }
    const made = await tx.boardStage.findMany({ where: { boardId }, select: { id: true, name: true } });
    for (const st of made) await seedMessages(tx, st);
    console.log(`  with ${DREAM_156.stages.length} stages, ${DREAM_156.fields.length} properties and the sequence's messages`);
  });
}

// The Dream 156 board setup made, with its stages and properties
async function findBoard() {
  const team = await salesTeam();
  const section = await prisma.space.findFirst({ where: { teamId: team.id, parentId: null, slug: "outreach" }, select: { id: true } });
  const portal = section && (await prisma.space.findFirst({ where: { teamId: team.id, parentId: section.id, slug: "podcast" }, select: { id: true } }));
  const board =
    portal &&
    (await prisma.space.findFirst({
      where: { teamId: team.id, parentId: portal.id, slug: slugify(DREAM_156.name), kind: "board" },
      select: {
        id: true,
        stages: { select: { id: true, name: true, color: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
        fields: { select: { id: true, name: true, kind: true, options: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } },
      },
    }));
  if (!board) throw new Error("The Dream 156 board isn't there yet. Run setup first.");
  return { teamId: team.id, board };
}

const readSamples = (path: string | undefined): Sample[] => {
  if (!path) throw new Error("Give the path to the sample JSON.");
  return JSON.parse(readFileSync(path, "utf8"));
};

async function sample(path: string | undefined) {
  const samples = readSamples(path);
  const { teamId, board } = await findBoard();
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ME }, select: { id: true, name: true } });
  // only someone still on staff in Sales can hold a lead
  const sales = await prisma.user.findMany({ where: { employment: { not: "former" }, departments: { some: { id: teamId } } }, select: { id: true, name: true } });
  const person = (name: string) => {
    const n = name.trim().toLowerCase();
    const exact = sales.find((u) => u.name.toLowerCase() === n);
    if (exact) return exact;
    // Notion often has just a first name ("Vivek"); take it only when it's unambiguous
    const first = sales.filter((u) => u.name.toLowerCase().split(/\s+/)[0] === n);
    return first.length === 1 ? first[0] : undefined;
  };
  const taken = new Set((await prisma.lead.findMany({ where: { boardId: board.id }, select: { title: true } })).map((l) => l.title));

  const made: string[] = [];
  for (const [i, s] of samples.entries()) {
    if (taken.has(s.title)) {
      console.log(`Skipped "${s.title}": already on the board`);
      continue;
    }
    const stage = board.stages.find((st) => st.name === s.stage) ?? board.stages[0];
    if (stage.name !== s.stage) console.log(`  "${s.title}": no stage "${s.stage}", put in "${stage.name}"`);

    const values: Record<string, unknown> = {};
    for (const f of board.fields) {
      let raw: unknown = f.kind === "contacts" ? s.contacts?.map((c) => ({ ...c, id: randomUUID() })) : f.kind === "links" ? s.links : s.values?.[f.name];
      if (raw == null || (Array.isArray(raw) && !raw.length)) continue;
      if (f.kind === "select" || f.kind === "multi") {
        const names = Array.isArray(raw) ? (raw as string[]) : [raw as string];
        const ids = names.map((n) => f.options.find((o) => o.name === n)?.id);
        names.filter((_, j) => !ids[j]).forEach((n) => console.log(`  "${s.title}": ${f.name} has no tag "${n}", skipped`));
        raw = ids.filter(Boolean);
      }
      const clean = cleanValue(f.kind as FieldKind, raw, f.options.map((o) => o.id));
      if ("error" in clean) console.log(`  "${s.title}": ${f.name} skipped (${clean.error})`);
      else if (clean.value != null) values[f.id] = clean.value;
    }
    const known = new Set(board.fields.map((f) => f.name));
    Object.keys(s.values ?? {})
      .filter((k) => !known.has(k))
      .forEach((k) => console.log(`  "${s.title}": no property "${k}" on the board, skipped`));

    const assignee = s.assignedTo ? person(s.assignedTo) : undefined;
    if (s.assignedTo && !assignee) console.log(`  "${s.title}": nobody called "${s.assignedTo}" works in Sales, left unassigned`);

    const id = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          boardId: board.id,
          stageId: stage.id,
          title: s.title,
          sortOrder: Date.now() + i,
          assignedToId: assignee?.id ?? null,
          values: values as Prisma.InputJsonValue,
          notes: s.notes ?? "",
          createdById: me.id,
        },
        select: { id: true },
      });
      await tx.leadEvent.create({ data: { leadId: lead.id, kind: "created", summary: "Copied from Notion for testing", toStage: stage.name, byId: me.id, byName: me.name } });
      return lead.id;
    });
    made.push(id);
    console.log(`Created "${s.title}" in ${stage.name}: ${id}`);
  }
  console.log(`${made.length} of ${samples.length} sample leads created.`);
}

async function removeSample(path: string | undefined) {
  const titles = readSamples(path).map((s) => s.title);
  const { board } = await findBoard();
  // only the copies this script made, never a real lead that shares a title
  const where = { boardId: board.id, title: { in: titles }, events: { some: { kind: "created", summary: "Copied from Notion for testing" } } };
  const events = await prisma.leadEvent.count({ where: { lead: where } });
  const { count } = await prisma.lead.deleteMany({ where });
  console.log(`Removed ${count} sample leads and their ${events} history entries.`);
}

// A stage's messages from the sequence, if it has none yet
async function seedMessages(db: Prisma.TransactionClient | typeof prisma, stage: { id: string; name: string }) {
  const list = SEQUENCE[stage.name];
  if (!list || (await db.stageMessage.count({ where: { stageId: stage.id } }))) return 0;
  await db.stageMessage.createMany({ data: list.map((m, i) => ({ stageId: stage.id, name: m.name, channel: m.channel, subject: m.subject ?? "", body: m.body, note: m.note, sortOrder: i + 1 })) });
  return list.length;
}

async function messages() {
  const { board } = await findBoard();
  for (const st of board.stages) {
    const n = await seedMessages(prisma, st);
    if (n) console.log(`${st.name}: ${n} ${n === 1 ? "message" : "messages"} added`);
  }
}

// Every stage's messages rewritten from the sequence (the FigJam board):
// a message found by its name (or a name it had) is updated in place, so
// leads keep their own copies and sent records; new ones are added; ones
// the board no longer has are removed.
async function sync() {
  const { board } = await findBoard();
  for (const [stageName, list] of Object.entries(SEQUENCE)) {
    const st = board.stages.find((x) => x.name === stageName);
    if (!st) {
      console.log(`No stage called ${stageName}: skipped`);
      continue;
    }
    const existing = await prisma.stageMessage.findMany({ where: { stageId: st.id }, select: { id: true, name: true } });
    const kept = new Set<string>();
    for (const [i, m] of list.entries()) {
      const data = { name: m.name, channel: m.channel, subject: m.subject ?? "", body: m.body, note: m.note, sortOrder: i + 1 };
      const found = existing.find((e) => !kept.has(e.id) && (e.name === m.name || m.was?.includes(e.name)));
      if (found) {
        kept.add(found.id);
        await prisma.stageMessage.update({ where: { id: found.id }, data });
      } else await prisma.stageMessage.create({ data: { ...data, stageId: st.id } });
    }
    const gone = existing.filter((e) => !kept.has(e.id));
    if (gone.length) await prisma.stageMessage.deleteMany({ where: { id: { in: gone.map((g) => g.id) } } });
    console.log(`${stageName}: ${list.length} messages${gone.length ? `, removed ${gone.map((g) => g.name).join(", ")}` : ""}`);
  }
}

// A day that went out on two platforms becomes one stage per platform: the
// stage keeps its leads under the first name, the second platform's stage
// comes right after it and takes that platform's messages.
const SPLITS: [string, string, string, string][] = [
  ["Day 1 · Email 1 and LinkedIn note", "Day 1 · Email 1", "Day 1 · LinkedIn note", "linkedin"],
  ["Day 7 · Instagram 3 and LinkedIn 3", "Day 7 · Instagram 3", "Day 7 · LinkedIn 3", "linkedin"],
];
async function split() {
  const { board } = await findBoard();
  for (const [old, first, second, channel] of SPLITS) {
    const i = board.stages.findIndex((x) => x.name === old);
    if (i < 0) continue;
    const st = board.stages[i];
    const next = board.stages[i + 1];
    await prisma.$transaction(async (tx) => {
      await tx.boardStage.update({ where: { id: st.id }, data: { name: first } });
      const made = await tx.boardStage.create({ data: { boardId: board.id, name: second, color: st.color, sortOrder: next ? (st.sortOrder + next.sortOrder) / 2 : st.sortOrder + 1 } });
      await tx.stageMessage.updateMany({ where: { stageId: st.id, channel }, data: { stageId: made.id } });
    });
    console.log(`${old} is now ${first}, then ${second}`);
  }
  const last = board.stages.find((x) => x.name === "Day 8 · Final email");
  if (last) {
    await prisma.boardStage.update({ where: { id: last.id }, data: { name: "Day 8 · Email 4" } });
    console.log("Day 8 · Final email is now Day 8 · Email 4");
  }
}

// Stage names that say what each stage is ("Day 3 · Email 2")
const RENAMES: [string, string][] = [["Dream 156", "Dream 156 list"], ["Shortlist", "Shortlisted"], ["Writeup Done", "Write-up done"], ["Ready to Reachout", "Ready to reach out"], ["Day 1", "Day 1 · Email 1"], ["Day 2", "Day 2 · Instagram 1"], ["Day 3", "Day 3 · Email 2"], ["Day 4", "Day 4 · LinkedIn DM"], ["Day 5", "Day 5 · Instagram 2"], ["Day 6", "Day 6 · Email 3"], ["Day 7", "Day 7 · Instagram 3"], ["Day 8", "Day 8 · Email 4"], ["Lead Magnet Sent", "Audit sent"], ["Didn't respond after the loom", "No reply after the audit"], ["Parked", "Parked for later"]];
async function rename() {
  const { board } = await findBoard();
  for (const [from, to] of RENAMES) {
    const st = board.stages.find((x) => x.name === from);
    if (!st) continue;
    await prisma.boardStage.update({ where: { id: st.id }, data: { name: to } });
    console.log(`${from} is now ${to}`);
  }
}

// The board as first copied whole from Notion, trimmed to what outreach uses
async function tidy() {
  const { board } = await findBoard();
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ME }, select: { id: true, name: true } });
  for (const f of board.fields.filter((f) => ["Approval", "Sent from", "Responded on"].includes(f.name))) {
    await prisma.$executeRaw`UPDATE "Lead" SET "values" = "values" - ${f.id}::text WHERE "boardId" = ${board.id}`;
    await prisma.boardField.delete({ where: { id: f.id } });
    console.log(`Removed the ${f.name} property`);
  }
  const stage = (name: string) => board.stages.find((st) => st.name === name);
  const later = stage("Later");
  if (later) {
    await prisma.boardStage.update({ where: { id: later.id }, data: { name: "Parked" } });
    console.log("Later is now Parked");
  }
  // duplicates fold into the stage they meant; their leads move, and say so
  for (const [name, intoName] of [["Not Moving Forward", "Dead"], ["Short form dream 150", "Dream 156"]] as const) {
    const from = stage(name);
    const into = stage(intoName);
    if (!from || !into) continue;
    const leads = await prisma.lead.findMany({ where: { stageId: from.id }, select: { id: true } });
    await prisma.$transaction([
      prisma.lead.updateMany({ where: { stageId: from.id }, data: { stageId: into.id } }),
      prisma.leadEvent.createMany({ data: leads.map((l) => ({ leadId: l.id, kind: "moved", summary: `Moved from ${name} to ${intoName}`, fromStage: name, toStage: intoName, reason: "The two stages were merged.", byId: me.id, byName: me.name })) }),
      prisma.boardStage.delete({ where: { id: from.id } }),
    ]);
    console.log(`${name} merged into ${intoName} (${leads.length} leads moved)`);
  }
}

const [mode, path] = process.argv.slice(3); // argv[2] is this script, passed by run.cjs
const modes: Record<string, () => Promise<unknown>> = { setup, sample: () => sample(path), "remove-sample": () => removeSample(path), tidy, messages, sync, split, rename };
await (modes[mode]?.() ?? Promise.reject(new Error(`Say one of: ${Object.keys(modes).join(", ")}.`)));
await prisma.$disconnect();
