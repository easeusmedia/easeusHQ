import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEPT, DEVELOPER, setsUp, worksDepartment, type Viewer } from "@/lib/scope";
import { cleanValue, dayOf, isFieldKind, type Contact, type FieldKind, type LinkValue, type Opener } from "@/lib/space";
import { addOption, assignLead, moveLead, renameLead, setLeadDraft, setLeadNotes, setLeadValue, setLeadVar } from "@/app/(workspace)/org/space/actions";
import { ToolError, type ServerInfo, type Tool } from "./protocol";

// What someone's Claude can do on the Sales dashboard through its
// connection (app/api/mcp): read the boards and their leads, add prepared
// leads in bulk, and change or move one. Every write goes through the same
// actions the app uses, as the person the key belongs to, so the rules
// (stage moves need a reason, tags come from the list) and the records hold.
// Sales only for now (Abhishek, 17 Oct 2026). Nothing here deletes.

type Acting = Viewer & { name: string };

export const INFO: ServerInfo = {
  name: "Easeus HQ",
  version: "1",
  instructions: [
    "Easeus HQ's Sales dashboard: boards of leads (doctors, podcasts). Each lead sits on a stage (Dream list, Ready to reach out, Day 1 to Day 8, Replied...) and has fields, the people to write to, links, and the emails written for it.",
    "Start with list_boards: each board's id, stages, fields with their tags, message templates (by id) and the people leads can be assigned to. Then find_leads and get_lead to read, add_leads to put prepared leads on a board (up to 50 a call; they land in the first stage, Dream list, and the team moves them on), update_lead to change one, move_lead to move one.",
    "Values go by field name (or id). Tags by name. People as { name, role, email, linkedin, instagram, youtube, phone }. A lead's opener emails as [{ label, drafts: { <message id or name>: { subject, body } } }], the main opener first, backups after.",
    "Nothing here deletes, and a lead is never moved unless asked.",
  ].join("\n"),
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---- the boards, as a connection sees them ----

type Field = {
  id: string;
  name: string;
  kind: FieldKind;
  required: boolean;
  options: { id: string; name: string }[];
};
type Msg = {
  id: string;
  stageId: string;
  stage: string;
  name: string;
  channel: string;
  subject: string;
  body: string;
  note: string;
};
type Board = {
  id: string;
  name: string;
  slug: string;
  teamId: string;
  path: string;
  url: string;
  stages: { id: string; name: string; day: number | null }[];
  fields: Field[];
  messages: Msg[];
};

async function salesTeam(acting: Acting) {
  const team = await prisma.team.findUnique({
    where: { slug: DEPT.sales },
    select: { id: true, slug: true, name: true },
  });
  if (!team) throw new ToolError("There is no Sales department.");
  if (!worksDepartment(acting, team.id)) throw new ToolError("You don't work in Sales, so this connection can't reach its boards.");
  return team;
}

async function salesBoards(acting: Acting, origin: string): Promise<Board[]> {
  const team = await salesTeam(acting);
  const spaces = await prisma.space.findMany({
    where: { teamId: team.id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      parentId: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          messages: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              channel: true,
              subject: true,
              body: true,
              note: true,
            },
          },
        },
      },
      fields: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          kind: true,
          required: true,
          options: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true },
          },
        },
      },
    },
  });
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const above = (s: (typeof spaces)[number]) => {
    const out: (typeof spaces)[number][] = [];
    for (let p = s.parentId ? byId.get(s.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) out.unshift(p);
    return out;
  };
  return spaces
    .filter((s) => s.kind === "board")
    .map((s) => {
      const up = above(s);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        teamId: team.id,
        path: [...up.map((x) => x.name), s.name].join(" › "),
        url: `${origin}/org/${team.slug}/${up.map((x) => x.slug).join("/")}?board=${s.slug}`,
        stages: s.stages.map((st) => ({
          id: st.id,
          name: st.name,
          day: dayOf(st.name),
        })),
        fields: s.fields
          .filter((f) => isFieldKind(f.kind))
          .map((f) => ({
            id: f.id,
            name: f.name,
            kind: f.kind as FieldKind,
            required: f.required,
            options: f.options,
          })),
        messages: s.stages.flatMap((st) => st.messages.map((m) => ({ ...m, stageId: st.id, stage: st.name }))),
      };
    });
}

async function boardOf(acting: Acting, origin: string, key: string): Promise<Board> {
  const boards = await salesBoards(acting, origin);
  const b = boards.find((x) => x.id === key) ?? boards.find((x) => same(x.name, key));
  if (!b) throw new ToolError(`No Sales board called ${key}. The boards: ${boards.map((x) => `${x.name} (${x.id})`).join("; ")}.`);
  return b;
}

const fieldOf = (board: Board, key: string): Field => {
  const f = board.fields.find((x) => x.id === key) ?? board.fields.find((x) => same(x.name, key));
  if (!f) throw new ToolError(`${board.name} has no field called ${key}. Its fields: ${board.fields.map((x) => x.name).join(", ")}.`);
  return f;
};
const stageOf = (board: Board, key: string) => {
  const s = board.stages.find((x) => x.id === key) ?? board.stages.find((x) => same(x.name, key));
  if (!s) throw new ToolError(`${board.name} has no stage called ${key}. Its stages: ${board.stages.map((x) => x.name).join(", ")}.`);
  return s;
};
const messageOf = (board: Board, key: string) => {
  const m = board.messages.find((x) => x.id === key) ?? board.messages.find((x) => same(x.name, key)) ?? board.messages.find((x) => same(`${x.stage} · ${x.name}`, key));
  if (!m) throw new ToolError(`${board.name} has no message called ${key}. Its messages: ${board.messages.map((x) => `${x.name} (${x.id})`).join("; ")}.`);
  return m;
};

// who a lead can be given to: Level 1, and everyone who works in Sales
async function salesPeople(teamId: string) {
  return prisma.user.findMany({
    where: {
      employment: { not: "former" },
      OR: [{ role: "admin" }, { email: DEVELOPER }, { departments: { some: { id: teamId } } }],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
async function personOf(teamId: string, key: string) {
  const people = await salesPeople(teamId);
  const p = people.find((x) => x.id === key) ?? people.find((x) => same(x.email, key)) ?? people.find((x) => same(x.name, key));
  if (!p) throw new ToolError(`Nobody in Sales called ${key}. The people: ${people.map((x) => x.name).join(", ")}.`);
  return p;
}

// ---- what comes in, in plain shapes ----

// one value, or several (a person with two phones, two Instagram pages)
const oneOrMore = (max: number) => z.union([z.string().max(max), z.array(z.string().max(max)).max(20)]);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const contactIn = z
  .object({
    id: z.string().max(64).optional().describe("Keep a person's id when changing them, so their marks stay theirs"),
    name: z.string().max(120).optional(),
    role: z.string().max(60).optional().describe("Host, Producer, Founder, Assistant…"),
    email: oneOrMore(300).optional().describe("One address, or several"),
    emails: z.array(z.string().max(300)).max(20).optional().describe("The same as email, as a list"),
    phone: oneOrMore(60).optional(),
    linkedin: oneOrMore(300).optional().describe("Their LinkedIn page"),
    instagram: oneOrMore(300).optional().describe("Their Instagram page or @handle"),
    youtube: oneOrMore(300).optional().describe("Their YouTube channel"),
    x: oneOrMore(300).optional(),
    website: oneOrMore(300).optional().describe("Any other page of theirs"),
  })
  .describe("A person on the lead");
type ContactIn = z.infer<typeof contactIn>;
const linkIn = z.union([z.string().max(500), z.object({ label: z.string().max(80).default(""), url: z.string().max(500) })]);
const draftIn = z.object({
  subject: z.string().max(300).default(""),
  body: z.string().min(1).max(20_000),
});
const openerIn = z.object({
  label: z.string().max(80).default("").describe('"Main · D1 Old hit still on top", "Backup · D2 View swing"'),
  drafts: z.record(z.string(), draftIn).describe("By message id or name (from list_boards), the wording written for this lead"),
});

function toContact(raw: unknown, i: number): Contact {
  if (raw && typeof raw === "object" && "channels" in raw) return raw as Contact;
  const p = contactIn.safeParse(raw);
  if (!p.success) throw new ToolError(`Person ${i + 1}: ${z.prettifyError(p.error)}`);
  const d = p.data;
  const channels: Contact["channels"] = [];
  for (const e of [...new Set([...many(d.email), ...(d.emails ?? [])])]) if (e.trim()) channels.push({ kind: "email", value: e });
  const pages: [Exclude<keyof ContactIn, "id" | "name" | "role" | "email" | "emails">, Contact["channels"][number]["kind"]][] = [
    ["phone", "phone"],
    ["linkedin", "linkedin"],
    ["instagram", "instagram"],
    ["youtube", "youtube"],
    ["x", "x"],
    ["website", "other"],
  ];
  for (const [key, kind] of pages) for (const v of many(d[key])) if (v.trim()) channels.push({ kind, value: v });
  return {
    id: d.id ?? crypto.randomUUID(),
    name: d.name ?? "",
    role: d.role ?? "",
    channels,
  };
}

// people changed keep their ids (and so their marks and approvals): matched
// by id, else by name, else by an email address they share
function keepIds(before: Contact[], next: Contact[]): Contact[] {
  const emails = (c: Contact) => c.channels.filter((ch) => ch.kind === "email").map((ch) => ch.value.trim().toLowerCase());
  return next.map((c) => {
    if (before.some((b) => b.id === c.id)) return c;
    const match = before.find((b) => c.name.trim() && same(b.name, c.name)) ?? before.find((b) => emails(b).some((e) => emails(c).includes(e)));
    return match ? { ...c, id: match.id } : c;
  });
}

const toOpeners = (board: Board, raw: z.infer<typeof openerIn>[]): Opener[] =>
  raw.map((o) => ({
    label: o.label,
    drafts: Object.fromEntries(Object.entries(o.drafts).map(([k, d]) => [messageOf(board, k).id, { subject: d.subject, body: d.body }])),
  }));

// a field's value as the app stores it, from what Claude sends: tags by
// name (made on the spot by someone who sets the app up), people and links
// in their plain shapes, then the app's own check (cleanValue)
async function storedValue(acting: Acting, board: Board, f: Field, raw: unknown, before: Contact[], added: string[]): Promise<unknown> {
  let v: unknown;
  switch (f.kind) {
    case "select":
    case "multi": {
      if (raw == null || raw === "") return null;
      // a multi field takes a list; a comma list in one string is split, so no tag is made of the whole line
      const names = (Array.isArray(raw) ? raw.map(String) : f.kind === "multi" && !f.options.some((o) => same(o.name, String(raw))) ? String(raw).split(",") : [String(raw)]).map((n) => n.trim()).filter(Boolean);
      if (f.kind === "select" && names.length > 1) throw new ToolError(`${f.name} takes one tag, not ${names.length}: ${names.join(", ")}.`);
      const ids: string[] = [];
      for (const n of names) {
        let o = f.options.find((x) => x.id === n) ?? f.options.find((x) => same(x.name, n));
        if (!o) {
          if (!setsUp(acting)) throw new ToolError(`${f.name} has no tag called ${n}. Its tags: ${f.options.map((x) => x.name).join(", ")}.`);
          const r = await addOption(f.id, n);
          if (r.error || !r.option) throw new ToolError(r.error ?? `The tag ${n} couldn't be added to ${f.name}.`);
          o = { id: r.option.id, name: r.option.name };
          f.options.push(o);
          added.push(`${f.name}: ${o.name}`);
        }
        ids.push(o.id);
      }
      v = ids;
      break;
    }
    case "count":
      v = raw == null || raw === "" ? null : typeof raw === "object" ? raw : { n: Number(raw), remark: "" };
      break;
    case "contacts":
      v = Array.isArray(raw) ? keepIds(before, raw.map(toContact)) : null;
      break;
    case "links":
      v = Array.isArray(raw) ? raw.map((l) => (typeof l === "string" ? { label: "", url: l } : l)) : null;
      break;
    case "checkbox":
      v = raw === true || raw === "yes" || raw === "true" ? true : null;
      break;
    default:
      v = raw == null ? null : String(raw);
  }
  const clean = cleanValue(
    f.kind,
    v,
    f.options.map((o) => o.id),
  );
  if ("error" in clean) throw new ToolError(`${f.name}: ${clean.error}`);
  return clean.value;
}

// ---- what goes out, readable ----

const LEAD_SELECT = {
  id: true,
  title: true,
  stageId: true,
  values: true,
  vars: true,
  notes: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  stageSince: true,
} satisfies Prisma.LeadSelect;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;

function readable(f: Field, v: unknown): unknown {
  if (v == null) return null;
  switch (f.kind) {
    case "select":
      return (v as string[]).map((id) => f.options.find((o) => o.id === id)?.name ?? id)[0] ?? null;
    case "multi":
      return (v as string[]).map((id) => f.options.find((o) => o.id === id)?.name ?? id);
    case "contacts":
      // the same shape add_leads and update_lead take, so a person read can be sent back whole
      return (v as Contact[]).map((c) => {
        const by: Record<string, string[]> = {};
        for (const ch of c.channels) (by[ch.kind === "other" ? "website" : ch.kind] ??= []).push(ch.value);
        return { id: c.id, name: c.name, role: c.role || undefined, ...Object.fromEntries(Object.entries(by).map(([k, vs]) => [k, vs.length === 1 ? vs[0] : vs])) };
      });
    case "links":
      return (v as LinkValue[]).map((l) => ({ label: l.label, url: l.url }));
    case "count": {
      const c = v as { n: number | null; remark: string };
      return c.remark ? { n: c.n, remark: c.remark } : c.n;
    }
    default:
      return v;
  }
}

const brief = (board: Board, l: LeadRow) => {
  const values = (l.values ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const f of board.fields) if (values[f.id] != null) fields[f.name] = readable(f, values[f.id]);
  const stage = board.stages.find((s) => s.id === l.stageId);
  return {
    id: l.id,
    title: l.title,
    stage: stage ? { id: stage.id, name: stage.name } : null,
    since: l.stageSince.toISOString(),
    assigned_to: l.assignedTo?.name ?? null,
    fields,
    vars: (l.vars ?? {}) as Record<string, string>,
    url: `${board.url}&lead=${l.id}`,
    updated_at: l.updatedAt.toISOString(),
  };
};

// a lead's words to search: its name, its people, its field values
const wordsOf = (board: Board, l: LeadRow) => {
  const values = (l.values ?? {}) as Record<string, unknown>;
  const parts = [l.title];
  for (const f of board.fields) {
    const v = values[f.id];
    if (f.kind === "contacts" && Array.isArray(v)) for (const c of v as Contact[]) parts.push(c.name, c.role, ...c.channels.map((ch) => ch.value));
    else if (typeof v === "string") parts.push(v);
    else if (f.kind === "select" || f.kind === "multi") parts.push(String(readable(f, v) ?? ""));
  }
  return parts.join(" ").toLowerCase();
};

async function leadOf(acting: Acting, origin: string, id: string) {
  const row = await prisma.lead.findUnique({
    where: { id },
    select: { ...LEAD_SELECT, boardId: true },
  });
  if (!row) throw new ToolError("That lead doesn't exist (or was deleted). Check its id with find_leads.");
  const board = await boardOf(acting, origin, row.boardId);
  return { row, board };
}

// ---- the tools ----

const schemaOf = (s: z.ZodType) => {
  const j = z.toJSONSchema(s, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  delete j.$schema;
  return j;
};

const leadIn = z.object({
  title: z.string().min(1).max(200).describe("The lead's name: the doctor or clinic, the podcast"),
  stage: z.string().optional().describe("A stage id or name; the board's first stage when left out"),
  values: z.record(z.string(), z.unknown()).optional().describe("By field name or id: text as a string, a number as a number, tags as a name or a list of names, a checkbox as true"),
  contacts: z.array(contactIn).max(50).optional().describe("The people to write to"),
  links: z.array(linkIn).max(50).optional().describe("The lead's own pages: YouTube channel, a video, its Notion page, its website"),
  vars: z.record(z.string(), z.string().max(2000)).optional().describe("The words the templates fill in, by name: { Name, Guest, Gap… }"),
  notes: z.string().max(100_000).optional().describe("A write-up kept on the lead"),
  openers: z.array(openerIn).max(10).optional().describe("The emails written for this lead ahead, the main opener first, backups after"),
  assigned_to: z.string().optional().describe("Who it's given to: a person's id, name or email (from list_boards); else whoever's key this is"),
});

export function salesTools(acting: Acting, origin: string): Tool[] {
  const tool = <S extends z.ZodType>(name: string, description: string, schema: S, run: (args: z.infer<S>) => Promise<unknown>): Tool => ({
    name,
    description,
    inputSchema: schemaOf(schema),
    run: async (args) => {
      const p = schema.safeParse(args);
      if (!p.success) throw new ToolError(`Check the arguments: ${z.prettifyError(p.error)}`);
      return run(p.data);
    },
  });

  return [
    tool("list_boards", "The Sales boards: each one's id, stages (in order, with how many leads on each), fields with their tags, message templates (id, stage, name, channel) and the people leads can be assigned to. Call this first.", z.object({}), async () => {
      const boards = await salesBoards(acting, origin);
      const [counts, people] = await Promise.all([
        prisma.lead.groupBy({
          by: ["stageId"],
          _count: { _all: true },
          where: { boardId: { in: boards.map((b) => b.id) } },
        }),
        boards.length ? salesPeople(boards[0].teamId) : [],
      ]);
      const on = new Map(counts.map((c) => [c.stageId, c._count._all]));
      return {
        boards: boards.map((b) => ({
          id: b.id,
          name: b.name,
          path: b.path,
          url: b.url,
          stages: b.stages.map((s) => ({
            id: s.id,
            name: s.name,
            day: s.day ?? undefined,
            leads: on.get(s.id) ?? 0,
          })),
          fields: b.fields.map((f) => ({
            id: f.id,
            name: f.name,
            kind: f.kind,
            required: f.required || undefined,
            tags: f.kind === "select" || f.kind === "multi" ? f.options.map((o) => o.name) : undefined,
          })),
          messages: b.messages.map((m) => ({
            id: m.id,
            stage: m.stage,
            name: m.name,
            channel: m.channel,
          })),
        })),
        people: people.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
        })),
        me: acting.name.replace(/ via Claude$/, ""),
      };
    }),

    tool("get_messages", "A board's message templates in full: each day's email, LinkedIn note or Instagram DM, with its subject, wording ({{Name}}-style variables filled per lead) and sending rule.", z.object({ board_id: z.string() }), async ({ board_id }) => {
      const b = await boardOf(acting, origin, board_id);
      return {
        board: b.name,
        messages: b.messages.map((m) => ({
          id: m.id,
          stage: m.stage,
          name: m.name,
          channel: m.channel,
          subject: m.subject || undefined,
          body: m.body,
          note: m.note || undefined,
        })),
      };
    }),

    tool(
      "find_leads",
      "Leads on a board, briefly: name, stage, who has it, its fields and people. Filter by stage, by who it's assigned to, or search any words (names, emails, field values). Pages of up to 200.",
      z.object({
        board_id: z.string().describe("The board's id or name"),
        stage: z.string().optional().describe("A stage id or name"),
        assigned_to: z.string().optional().describe("A person's id, name or email"),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      async (a) => {
        const board = await boardOf(acting, origin, a.board_id);
        const stage = a.stage ? stageOf(board, a.stage) : null;
        const person = a.assigned_to ? await personOf(board.teamId, a.assigned_to) : null;
        const rows = await prisma.lead.findMany({
          where: {
            boardId: board.id,
            ...(stage && { stageId: stage.id }),
            ...(person && { assignedToId: person.id }),
          },
          select: LEAD_SELECT,
        });
        const order = new Map(board.stages.map((s, i) => [s.id, i]));
        const q = a.search?.trim().toLowerCase();
        const hits = rows.filter((l) => !q || wordsOf(board, l).includes(q)).sort((x, y) => (order.get(x.stageId) ?? 0) - (order.get(y.stageId) ?? 0) || x.updatedAt.getTime() - y.updatedAt.getTime());
        return {
          board: board.name,
          total: hits.length,
          offset: a.offset,
          leads: hits.slice(a.offset, a.offset + a.limit).map((l) => brief(board, l)),
        };
      },
    ),

    tool("get_lead", "Everything about one lead: its fields, people, links, variables, the emails written for it (openers and rewrites), what was sent, its channel's numbers, and its record of moves and hand-offs.", z.object({ lead_id: z.string() }), async ({ lead_id }) => {
      const { row, board } = await leadOf(acting, origin, lead_id);
      const [full, events, sent] = await Promise.all([
        prisma.lead.findUniqueOrThrow({
          where: { id: lead_id },
          select: {
            picks: true,
            marks: true,
            approvals: true,
            openers: true,
            drafts: true,
            channel: true,
            channelAt: true,
            assignedByName: true,
            assignedAt: true,
            editedByName: true,
            editedAt: true,
            createdBy: { select: { name: true } },
          },
        }),
        prisma.leadEvent.findMany({
          where: { leadId: lead_id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            kind: true,
            summary: true,
            reason: true,
            byName: true,
            createdAt: true,
          },
        }),
        prisma.sentMessage.findMany({
          where: { leadId: lead_id },
          orderBy: { sentAt: "desc" },
          select: {
            name: true,
            channel: true,
            subject: true,
            byName: true,
            sentAt: true,
          },
        }),
      ]);
      const nameOf = (id: string) => board.messages.find((m) => m.id === id)?.name ?? id;
      const openers = (Array.isArray(full.openers) ? (full.openers as Opener[]) : []).map((o) => ({
        label: o.label,
        drafts: Object.fromEntries(Object.entries(o.drafts).map(([k, d]) => [nameOf(k), d])),
      }));
      const drafts = Object.fromEntries(Object.entries((full.drafts ?? {}) as Record<string, unknown>).map(([k, d]) => [nameOf(k), d]));
      return {
        ...brief(board, row),
        board: board.name,
        notes: row.notes || undefined,
        added: `${row.createdAt.toISOString()} by ${full.createdBy.name}`,
        assigned_by: full.assignedByName ? `${full.assignedByName}, ${full.assignedAt?.toISOString() ?? ""}` : undefined,
        edited: full.editedByName ? `${full.editedByName}, ${full.editedAt?.toISOString() ?? ""}` : undefined,
        opener_in_use: ((full.picks ?? {}) as Record<string, string>).opener ?? "0",
        openers,
        rewritten: Object.keys(drafts).length ? drafts : undefined,
        approvals: full.approvals,
        marks: full.marks,
        channel: full.channel
          ? {
              ...(full.channel as object),
              read_at: full.channelAt?.toISOString(),
            }
          : undefined,
        sent: sent.map((s) => ({ ...s, sentAt: s.sentAt.toISOString() })),
        record: events.map((e) => ({
          what: e.summary,
          why: e.reason ?? undefined,
          by: e.byName,
          at: e.createdAt.toISOString(),
        })),
      };
    }),

    tool(
      "add_leads",
      "Put prepared leads on a board, up to 50 a call, each with its fields, people, links, variables and opener emails. They land in the first stage (Dream list) unless a stage is given, and go to whoever's key this is unless assigned_to says who. A lead whose name is already on the board is skipped, not doubled, unless allow_duplicates.",
      z.object({
        board_id: z.string().describe("The board's id or name"),
        leads: z.array(leadIn).min(1).max(50),
        stage: z.string().optional().describe("A stage id or name for all of them"),
        allow_duplicates: z.boolean().default(false),
      }),
      async (a) => {
        const board = await boardOf(acting, origin, a.board_id);
        const forAll = a.stage ? stageOf(board, a.stage) : null;
        const existing = new Set(
          (
            await prisma.lead.findMany({
              where: { boardId: board.id },
              select: { title: true },
            })
          ).map((l) => l.title.trim().toLowerCase()),
        );
        const added: string[] = [];
        const created: { id: string; title: string; url: string }[] = [];
        const skipped: { title: string; reason: string }[] = [];
        const failed: { title: string; error: string }[] = [];
        for (const lead of a.leads) {
          const title = lead.title.trim().replace(/\s+/g, " ");
          if (!a.allow_duplicates && existing.has(title.toLowerCase())) {
            skipped.push({ title, reason: "already on the board" });
            continue;
          }
          try {
            const stage = lead.stage ? stageOf(board, lead.stage) : (forAll ?? board.stages[0]);
            if (!stage) throw new ToolError("This board has no stages yet.");
            const values: Record<string, unknown> = {};
            const input: Record<string, unknown> = { ...(lead.values ?? {}) };
            if (lead.contacts) input[board.fields.find((f) => f.kind === "contacts")?.name ?? "Contacts"] = lead.contacts;
            if (lead.links) input[board.fields.find((f) => f.kind === "links")?.name ?? "Links"] = lead.links;
            for (const [key, raw] of Object.entries(input)) {
              const f = fieldOf(board, key);
              const v = await storedValue(acting, board, f, raw, [], added);
              if (v != null) values[f.id] = v;
            }
            const missing = board.fields.filter((f) => f.required && values[f.id] == null);
            if (missing.length) throw new ToolError(`${missing.map((f) => f.name).join(", ")} ${missing.length === 1 ? "is" : "are"} required on ${board.name}.`);
            const openers = lead.openers ? toOpeners(board, lead.openers) : [];
            const vars = Object.fromEntries(
              Object.entries(lead.vars ?? {})
                .map(([k, v]) => [k.trim().slice(0, 60), v.trim().slice(0, 2000)])
                .filter(([k, v]) => k && v),
            );
            const to = lead.assigned_to ? await personOf(board.teamId, lead.assigned_to) : { id: acting.id, name: acting.name };
            const id = await prisma.$transaction(async (tx) => {
              const made = await tx.lead.create({
                data: {
                  boardId: board.id,
                  stageId: stage.id,
                  title,
                  values: values as Prisma.InputJsonValue,
                  vars,
                  notes: lead.notes ?? "",
                  openers: openers as unknown as Prisma.InputJsonValue,
                  sortOrder: Date.now(),
                  createdById: acting.id,
                  assignedToId: to.id,
                  assignedByName: acting.name,
                  assignedAt: new Date(),
                },
                select: { id: true },
              });
              await tx.leadEvent.create({
                data: {
                  leadId: made.id,
                  kind: "created",
                  summary: `Created in ${stage.name}`,
                  toStage: stage.name,
                  byId: acting.id,
                  byName: acting.name,
                },
              });
              return made.id;
            });
            existing.add(title.toLowerCase());
            created.push({ id, title, url: `${board.url}&lead=${id}` });
          } catch (err) {
            failed.push({
              title,
              error: err instanceof ToolError ? err.message : "It couldn't be saved.",
            });
            if (!(err instanceof ToolError)) console.error(err);
          }
        }
        return {
          board: board.name,
          created,
          skipped: skipped.length ? skipped : undefined,
          failed: failed.length ? failed : undefined,
          tags_added: added.length ? [...new Set(added)] : undefined,
        };
      },
    ),

    tool(
      "update_lead",
      "Change one lead: its name, any fields (by name), its people (the list given replaces the old one; keep ids to keep their marks), links, variables, write-up, who has it, its opener emails, a message rewritten for it alone, or its stage (with a reason when going back or skipping ahead).",
      z.object({
        lead_id: z.string(),
        title: z.string().min(1).max(200).optional(),
        values: z.record(z.string(), z.unknown()).optional().describe("By field name or id; null clears a field"),
        contacts: z.array(contactIn).max(50).optional(),
        links: z.array(linkIn).max(50).optional(),
        vars: z.record(z.string(), z.string().max(2000)).optional().describe("Empty text clears one"),
        notes: z.string().max(100_000).optional(),
        assigned_to: z.string().nullable().optional().describe("A person's id, name or email; null takes it off everyone"),
        openers: z.array(openerIn).max(10).optional().describe("Replaces the emails written for it ahead"),
        drafts: z.record(z.string(), draftIn.nullable()).optional().describe("By message id or name: wording for this lead alone; null puts the template back"),
        stage: z.string().optional().describe("A stage id or name"),
        reason: z.string().max(2000).optional().describe("Why, when moving back or skipping ahead"),
      }),
      async (a) => {
        const { row, board } = await leadOf(acting, origin, a.lead_id);
        const changed: string[] = [];
        const added: string[] = [];
        const check = (r: { error?: string }, what: string) => {
          if (r.error) throw new ToolError(`${what}: ${r.error}`);
          changed.push(what);
        };
        try {
          if (a.title !== undefined) check(await renameLead(row.id, a.title), "name");
          const values = (row.values ?? {}) as Record<string, unknown>;
          const input: Record<string, unknown> = { ...(a.values ?? {}) };
          if (a.contacts) input[board.fields.find((f) => f.kind === "contacts")?.name ?? "Contacts"] = a.contacts;
          if (a.links) input[board.fields.find((f) => f.kind === "links")?.name ?? "Links"] = a.links;
          for (const [key, raw] of Object.entries(input)) {
            const f = fieldOf(board, key);
            const before = f.kind === "contacts" && Array.isArray(values[f.id]) ? (values[f.id] as Contact[]) : [];
            const v = await storedValue(acting, board, f, raw, before, added);
            check(await setLeadValue(row.id, f.id, v), f.name);
          }
          for (const [k, v] of Object.entries(a.vars ?? {})) check(await setLeadVar(row.id, k, v), `{{${k}}}`);
          if (a.notes !== undefined) check(await setLeadNotes(row.id, a.notes), "write-up");
          if (a.assigned_to !== undefined) {
            const to = a.assigned_to ? await personOf(board.teamId, a.assigned_to) : null;
            check(await assignLead(row.id, to?.id ?? null), to ? `given to ${to.name}` : "unassigned");
          }
          if (a.openers) {
            const openers = toOpeners(board, a.openers);
            await prisma.lead.update({
              where: { id: row.id },
              data: {
                openers: openers as unknown as Prisma.InputJsonValue,
                editedByName: acting.name,
                editedAt: new Date(),
              },
            });
            changed.push("openers");
          }
          for (const [k, d] of Object.entries(a.drafts ?? {})) {
            const m = messageOf(board, k);
            check(await setLeadDraft(row.id, m.id, d), d ? `${m.name} rewritten` : `${m.name} back to the template`);
          }
          if (a.stage) {
            const to = stageOf(board, a.stage);
            const r = await moveLead(row.id, to.id, Date.now(), a.reason);
            if (r.needsReason) throw new ToolError(`Moving to ${to.name} goes back or skips ahead, so it needs a reason: pass one.`);
            check(r, `moved to ${to.name}`);
          }
        } catch (err) {
          // whatever stopped it, what had landed by then is said too
          const why = err instanceof ToolError ? err.message : "It couldn't be saved.";
          if (!(err instanceof ToolError)) console.error(err);
          throw new ToolError(`${why}${changed.length ? ` (Already changed: ${changed.join(", ")}.)` : " Nothing was changed."}`);
        }
        return {
          lead: row.title,
          changed,
          tags_added: added.length ? added : undefined,
          url: `${board.url}&lead=${row.id}`,
        };
      },
    ),

    tool(
      "move_lead",
      "Move one lead to another stage. One step forward needs nothing; going back or skipping ahead needs a reason, which stays on the lead's record.",
      z.object({
        lead_id: z.string(),
        stage: z.string().describe("A stage id or name"),
        reason: z.string().max(2000).optional(),
      }),
      async (a) => {
        const { row, board } = await leadOf(acting, origin, a.lead_id);
        const to = stageOf(board, a.stage);
        const r = await moveLead(row.id, to.id, Date.now(), a.reason);
        if (r.needsReason) throw new ToolError(`Moving ${row.title} to ${to.name} goes back or skips ahead, so it needs a reason: pass one.`);
        if (r.error) throw new ToolError(r.error);
        return { lead: row.title, stage: to.name };
      },
    ),

    tool(
      "add_tag",
      "Add a tag to a tag field (Country, To check…) so leads can use it. Only someone who sets the app up may.",
      z.object({
        board_id: z.string(),
        field: z.string().describe("The field's name or id"),
        name: z.string().min(1).max(120),
      }),
      async (a) => {
        const board = await boardOf(acting, origin, a.board_id);
        const f = fieldOf(board, a.field);
        if (!setsUp(acting)) throw new ToolError("Only Level 1 (and Admin & Technical's Level 2) can add tags.");
        const r = await addOption(f.id, a.name);
        if (r.error || !r.option) throw new ToolError(r.error ?? "That tag couldn't be added.");
        return { field: f.name, tag: r.option.name, id: r.option.id };
      },
    ),
  ];
}
