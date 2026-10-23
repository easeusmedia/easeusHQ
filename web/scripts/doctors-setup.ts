// Sales > Doctors: the Dream 300 YouTube and Dream 150 Instagram boards,
// with every doctor from their sequence pages (17 Oct 2026, Abhishek). The
// leads come from an import file built from those pages and each doctor's
// Notion page: contacts, links, details, and the messages written for them
// (YouTube: a main opener and backups; Instagram: one version, or A, B and C
// to pick from when Instagram hid the account).
//   node --env-file=.env scripts/run.cjs scripts/doctors-setup.ts setup <import.json> [--live]
//   node --env-file=.env scripts/run.cjs scripts/doctors-setup.ts leads <import.json> [--live]
// The import file is kept outside git, at ../data/dream/ (contact details): build.py makes
// import.json, clean.py import.clean.json, and template.py import.tpl.json, the one to use.
// setup can run again safely: a board already there is left as it is. leads
// skips a doctor whose name is already on the board.
import "./live";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanValue, slugify, type ColorName, type Contact, type Draft, type FieldKind } from "@/lib/space";

const ME = "abhishek@easeus.media";
type Slot = { subject: string; body: string };
type Row = {
  key: string;
  title: string;
  contacts: Omit<Contact, "id">[];
  links: { label: string; url: string }[];
  values: Record<string, unknown>;
  openers: { label: string; slots: Record<string, Slot> }[];
  drafts: Record<string, Slot>;
  // the values its {{Variables}} take (data/dream/template.py): the Fill in form
  vars?: Record<string, string>;
};
type ImportFile = { yt: Row[]; ig: Row[]; templates: { yt: Record<string, Slot>; ig: Record<string, Slot> } };

// One stage per day, as the sequence pages run it; Shortlisted isn't used
const DAYS: { stage: string; messages: { name: string; channel: string; note: string }[] }[] = [
  { stage: "Day 1", messages: [
    { name: "Email 1", channel: "email", note: 'Signed "Ashmit". The landing page link goes here and in DM 1 only.' },
    { name: "LinkedIn connection note", channel: "linkedin", note: "Same day, no link." },
  ] },
  { stage: "Day 2 · Instagram DM 1", messages: [{ name: "Instagram DM 1", channel: "instagram", note: "From @ashmit.shahi." }] },
  { stage: "Day 3 · Email 2", messages: [{ name: "Email 2", channel: "email", note: "A reply in the Email 1 thread." }] },
  { stage: "Day 4 · LinkedIn 1", messages: [{ name: "LinkedIn message 1", channel: "linkedin", note: "Only if they accepted the note. If not, skip LinkedIn 1 and 2." }] },
  { stage: "Day 5 · Instagram DM 2", messages: [{ name: "Instagram DM 2", channel: "instagram", note: "A reply under DM 1." }] },
  { stage: "Day 6 · Email 3", messages: [{ name: "Email 3 · Meme board", channel: "email", note: "A reply in the thread, image only, no text: the white-coat photo with their meme board, inline, not as an attachment." }] },
  { stage: "Day 7", messages: [
    { name: "Instagram DM 3", channel: "instagram", note: "A reply under DM 2." },
    { name: "LinkedIn message 2", channel: "linkedin", note: "Same day, only if they accepted." },
  ] },
  { stage: "Day 8 · Email 4", messages: [{ name: "Email 4", channel: "email", note: "A reply in the thread, then the slow re-touch list." }] },
];
const STAGES: { name: string; color: ColorName }[] = [
  { name: "Dream list", color: "default" },
  { name: "Ready to reach out", color: "cyan" },
  ...DAYS.map((d) => ({ name: d.stage, color: "blue" as ColorName })),
  { name: "Audit sent", color: "purple" },
  { name: "Replied", color: "green" },
  { name: "No reply after the audit", color: "orange" },
  { name: "Parked for later", color: "gray" },
  { name: "Dead", color: "red" },
];

type FieldSpec = { name: string; kind: FieldKind; onCard?: boolean; required?: boolean; options?: { name: string; color: ColorName }[] };
const opts = (names: string[], colors: ColorName[]) => names.map((name, i) => ({ name, color: colors[i % colors.length] }));
const MEME = { name: "Meme board", kind: "select", options: opts(["1", "2", "3"], ["blue", "purple", "pink"]) } as const;
const COUNTRY = { name: "Country", kind: "select", options: opts(["USA", "UK", "UAE"], ["blue", "red", "green"]) } as const;
const BOARDS: { key: "yt" | "ig"; name: string; fields: FieldSpec[] }[] = [
  {
    key: "yt",
    name: "Dream 300 YouTube",
    fields: [
      { name: "Contacts", kind: "contacts", required: true },
      { name: "Links", kind: "links" },
      { name: "Subscribers", kind: "text", onCard: true },
      { name: "Typical views", kind: "text", onCard: true },
      { name: "Opener", kind: "select", onCard: true, options: opts(["D1 · Old hit still on top", "D2 · View swing", "D3 · Real hit", "D4 · Shorts beat long videos", "D5 · New or small channel", "D6 · Steady poster", "D7 · Gone quiet"], ["green", "blue", "purple", "pink", "orange", "yellow", "gray"]) },
      MEME,
      COUNTRY,
      { name: "To check", kind: "multi", options: opts(["Find first name", "Check description", "100K+ subscribers", "Check fit: not aesthetics", "Hand-written opener"], ["red", "orange", "yellow", "orange", "blue"]) },
    ],
  },
  {
    key: "ig",
    name: "Dream 150 Instagram",
    fields: [
      { name: "Contacts", kind: "contacts", required: true },
      { name: "Links", kind: "links" },
      { name: "Followers", kind: "text", onCard: true },
      { name: "Usual views", kind: "text" },
      { name: "Version", kind: "select", onCard: true, options: opts(["A · A reel took off", "B · Capture in place", "C · No reel took off", "No data yet"], ["green", "blue", "purple", "gray"]) },
      MEME,
      COUNTRY,
      { name: "Bio", kind: "text" },
      { name: "To check", kind: "text" },
    ],
  },
];

const read = (path: string | undefined): ImportFile => {
  if (!path) throw new Error("Give the path to import.json.");
  return JSON.parse(readFileSync(path, "utf8"));
};

async function portalId() {
  const team = await prisma.team.findUniqueOrThrow({ where: { slug: "sales" }, select: { id: true } });
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ME }, select: { id: true, name: true } });
  let portal = await prisma.space.findFirst({ where: { teamId: team.id, parentId: null, slug: "doctors", kind: "portal" }, select: { id: true } });
  if (!portal) {
    const last = await prisma.space.aggregate({ where: { teamId: team.id, parentId: null }, _max: { sortOrder: true } });
    portal = await prisma.space.create({ data: { teamId: team.id, parentId: null, kind: "portal", name: "Doctors", slug: "doctors", sortOrder: (last._max.sortOrder ?? 0) + 1, createdById: me.id }, select: { id: true } });
    console.log('Created: portal "Doctors"');
  }
  return { teamId: team.id, portal: portal.id, me };
}

async function setup(path: string | undefined) {
  const file = read(path);
  const { teamId, portal, me } = await portalId();
  for (const [i, b] of BOARDS.entries()) {
    const slug = slugify(b.name);
    if (await prisma.space.findFirst({ where: { teamId, parentId: portal, slug }, select: { id: true } })) {
      console.log(`Already there: board "${b.name}"`);
      continue;
    }
    await prisma.$transaction(
      async (tx) => {
        const board = await tx.space.create({ data: { teamId, parentId: portal, kind: "board", name: b.name, slug, sortOrder: i + 1, createdById: me.id }, select: { id: true } });
        await tx.boardStage.createMany({ data: STAGES.map((s, j) => ({ boardId: board.id, name: s.name, color: s.color, sortOrder: j + 1 })) });
        const stages = await tx.boardStage.findMany({ where: { boardId: board.id }, select: { id: true, name: true } });
        for (const d of DAYS) {
          const stageId = stages.find((s) => s.name === d.stage)!.id;
          await tx.stageMessage.createMany({
            data: d.messages.map((m, j) => ({ stageId, name: m.name, channel: m.channel, note: m.note, subject: file.templates[b.key][m.name]?.subject ?? "", body: file.templates[b.key][m.name]?.body ?? "", sortOrder: j + 1 })),
          });
        }
        for (const [j, f] of b.fields.entries()) {
          const field = await tx.boardField.create({ data: { boardId: board.id, name: f.name, kind: f.kind, onCard: !!f.onCard, required: !!f.required, sortOrder: j + 1 }, select: { id: true } });
          if (f.options?.length) await tx.fieldOption.createMany({ data: f.options.map((o, k) => ({ fieldId: field.id, name: o.name, color: o.color, sortOrder: k + 1 })) });
        }
      },
      { timeout: 60_000 },
    );
    console.log(`Created: board "${b.name}" with ${STAGES.length} stages, ${b.fields.length} properties and the 8 days' messages`);
  }
}

async function leads(path: string | undefined) {
  const file = read(path);
  const { teamId, portal, me } = await portalId();
  for (const b of BOARDS) {
    const board = await prisma.space.findFirst({
      where: { teamId, parentId: portal, slug: slugify(b.name), kind: "board" },
      select: {
        id: true,
        stages: { select: { id: true, name: true, messages: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } },
        fields: { select: { id: true, name: true, kind: true, options: { select: { id: true, name: true } } } },
      },
    });
    if (!board) throw new Error(`The board "${b.name}" isn't there yet. Run setup first.`);
    // every doctor starts in the board's first stage, whatever it's called now
    // (live renamed Dream list); the team moves a few at a time on to Ready to
    // reach out (Abhishek, 17 Oct 2026)
    const start = board.stages[0];
    if (!start) throw new Error(`The board "${b.name}" has no stages.`);
    const messageId = new Map(board.stages.flatMap((s) => s.messages).map((m) => [m.name, m.id]));
    const byName = (slots: Record<string, Slot>) =>
      Object.fromEntries(Object.entries(slots).flatMap(([name, d]) => (messageId.has(name) ? [[messageId.get(name)!, { subject: d.subject ?? "", body: d.body } satisfies Draft]] : [])));
    const taken = new Set((await prisma.lead.findMany({ where: { boardId: board.id }, select: { title: true } })).map((l) => l.title));
    const rows = file[b.key].filter((r) => !taken.has(r.title));
    let n = 0;
    const base = Date.now();
    for (const [i, r] of rows.entries()) {
      const values: Record<string, unknown> = {};
      for (const f of board.fields) {
        // big numbers read as text ("20,400"): a count holds up to 9,999
        const v = r.values[f.name];
        let raw: unknown = f.kind === "contacts" ? r.contacts.map((c) => ({ ...c, id: randomUUID() })) : f.kind === "links" ? r.links : typeof v === "number" ? v.toLocaleString("en-GB") : v;
        if (raw == null || raw === "" || (Array.isArray(raw) && !raw.length)) continue;
        if (f.kind === "select" || f.kind === "multi") {
          const names = Array.isArray(raw) ? (raw as string[]) : [raw as string];
          raw = names.map((x) => f.options.find((o) => o.name === x)?.id).filter(Boolean);
          if (!(raw as string[]).length) continue;
        }
        const clean = cleanValue(f.kind as FieldKind, raw, f.options.map((o) => o.id));
        if ("error" in clean) console.log(`  "${r.title}": ${f.name} skipped (${clean.error})`);
        else if (clean.value != null) values[f.id] = clean.value;
      }
      await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            boardId: board.id,
            stageId: start.id,
            title: r.title,
            sortOrder: base + i,
            assignedToId: me.id,
            assignedByName: me.name,
            assignedAt: new Date(),
            values: values as Prisma.InputJsonValue,
            vars: (r.vars ?? {}) as Prisma.InputJsonValue,
            // every message written for it is one of its openers (one when there's
            // no choice to make); drafts stay for what the team rewrites
            openers: (r.openers.length ? r.openers.map((o) => ({ label: o.label, drafts: byName({ ...r.drafts, ...o.slots }) })) : [{ label: "", drafts: byName(r.drafts) }]) as Prisma.InputJsonValue,
            createdById: me.id,
          },
          select: { id: true },
        });
        await tx.leadEvent.create({ data: { leadId: lead.id, kind: "created", summary: `Created in ${start.name}, from the ${b.name} sequence page`, toStage: start.name, byId: me.id, byName: me.name } });
      });
      n++;
    }
    console.log(`${b.name}: ${n} leads added, ${file[b.key].length - rows.length} already there`);
  }
}

const [cmd, arg] = process.argv.slice(3).filter((a) => a !== "--live"); // argv[2] is this script, passed by run.cjs
const run = { setup, leads }[cmd as "setup" | "leads"];
if (!run) throw new Error("setup <import.json> or leads <import.json>");
await run(arg);
await prisma.$disconnect();
