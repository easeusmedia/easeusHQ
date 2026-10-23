// A department's own pages, Notion-style (prisma Space): a department holds
// portals (sections, a layer between, are no longer made), portals hold
// boards, a board is a database of leads moving
// through its stages, with properties every lead records. The rules here are
// pure, so the server enforces them and the client can preview them.

export type SpaceKind = "section" | "portal" | "board";

// What each level is called, and what it holds
export const CHILD_OF: Record<"department" | "section" | "portal", SpaceKind> = {
  department: "portal",
  section: "portal",
  portal: "board",
};
export const KIND_LABEL: Record<SpaceKind, string> = { section: "Section", portal: "Portal", board: "Board" };

// ---- Colours: Notion's, for stages and tags (inline styles, since names are
// picked at runtime and Tailwind can't generate classes for them) ----
export const COLORS = {
  default: "#8f949b",
  gray: "#9b9a97",
  brown: "#b98a72",
  orange: "#d9843b",
  yellow: "#d4a53a",
  green: "#4fa77d",
  blue: "#4b95e6",
  cyan: "#22b8cf",
  purple: "#9a6dd7",
  pink: "#d75b9b",
  red: "#e0605e",
} as const;
export type ColorName = keyof typeof COLORS;
export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];
export const isColor = (c: unknown): c is ColorName => typeof c === "string" && Object.hasOwn(COLORS, c);
export const hexOf = (c: string) => COLORS[isColor(c) ? c : "default"];
// Tags wear one quiet pill, like a task's kind of work
export const PILL_STYLE = { backgroundColor: "rgb(255 255 255 / 0.06)", borderColor: "rgb(255 255 255 / 0.1)", color: "var(--foreground)" };

// A stage's pill: the app's own quiet surface with an accent dot, the same
// for every stage (no rainbow of stage colours)
// A stage's pill, in the task board's own palette (lib/stages.ts STAGE):
// literal class strings, so Tailwind keeps them
const NEUTRAL = { dot: "bg-neutral-400", pill: "bg-surface text-muted border-border" };
export const STAGE_TONE: Record<string, { dot: string; pill: string }> = {
  default: NEUTRAL,
  gray: NEUTRAL,
  blue: { dot: "bg-blue-400", pill: "bg-blue-400/15 text-blue-300 border-blue-400/30" },
  cyan: { dot: "bg-cyan-400", pill: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
  purple: { dot: "bg-purple-400", pill: "bg-purple-400/15 text-purple-300 border-purple-400/30" },
  green: { dot: "bg-green-400", pill: "bg-green-400/15 text-green-300 border-green-400/30" },
  orange: { dot: "bg-orange-400", pill: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  red: { dot: "bg-rose-400", pill: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
  pink: { dot: "bg-pink-400", pill: "bg-pink-400/15 text-pink-300 border-pink-400/30" },
  brown: { dot: "bg-stone-400", pill: "bg-stone-400/15 text-stone-300 border-stone-400/30" },
  yellow: { dot: "bg-blue-400", pill: "bg-blue-400/15 text-blue-300 border-blue-400/30" },
};
export const toneOf = (color: string) => STAGE_TONE[color] ?? NEUTRAL;

// ---- Properties ----
export type FieldKind = "select" | "multi" | "count" | "contacts" | "links" | "checkbox" | "date" | "text";
export const FIELD_KINDS: { kind: FieldKind; label: string; hint: string }[] = [
  { kind: "select", label: "Tag", hint: "One tag, like Yes or No" },
  { kind: "multi", label: "Tags", hint: "Any number of tags" },
  { kind: "count", label: "Number and remark", hint: "A number, then a note about it" },
  { kind: "contacts", label: "Contacts", hint: "People, each with emails and handles" },
  { kind: "links", label: "Links", hint: "Pages and profiles" },
  { kind: "checkbox", label: "Checkbox", hint: "Done or not" },
  { kind: "date", label: "Date", hint: "A day" },
  { kind: "text", label: "Text", hint: "A line or two" },
];
export const isFieldKind = (k: string): k is FieldKind => FIELD_KINDS.some((f) => f.kind === k);

export type ChannelKind = "email" | "instagram" | "linkedin" | "x" | "youtube" | "phone" | "other";
export const CHANNELS: { kind: ChannelKind; label: string }[] = [
  { kind: "email", label: "Email" },
  { kind: "instagram", label: "Instagram" },
  { kind: "linkedin", label: "LinkedIn" },
  { kind: "x", label: "X" },
  { kind: "youtube", label: "YouTube" },
  { kind: "phone", label: "Phone" },
  { kind: "other", label: "Other" },
];
const isChannel = (k: unknown): k is ChannelKind => CHANNELS.some((c) => c.kind === k);

// The roles a contact can have; typing a new one adds it
export const CONTACT_ROLES = ["Host", "Co-host", "Founder", "Co-founder", "CEO", "Marketer", "Producer", "Assistant"];

// How each kind is stored in Lead.values[fieldId]
export type Contact = { id: string; name: string; role: string; channels: { kind: ChannelKind; value: string }[] };
export type LinkValue = { label: string; url: string };
export type CountValue = { n: number | null; remark: string };
export type FieldValue = string[] | CountValue | Contact[] | LinkValue[] | boolean | string | null;

// ---- What travels to the client ----
export type OptionData = { id: string; name: string; color: string };
export type FieldData = { id: string; name: string; kind: FieldKind; onCard: boolean; required: boolean; options: OptionData[] };
export type StageData = { id: string; name: string; color: string };
export type Person = { id: string; name: string };
export type LeadData = {
  id: string;
  title: string;
  stageId: string;
  sortOrder: number;
  // whoever added it, and whoever it's given to (if anyone)
  createdBy: Person;
  assignedTo: Person | null;
  // who assigned it, and when
  assignedByName: string | null;
  assignedAt: string | null;
  values: Record<string, unknown>;
  // its messages' variables, by name
  vars: Record<string, string>;
  // Email, from the sales inbox and the mail tracker, never by hand: whether
  // an email went to it (and a tracked one), how often its emails were
  // opened, its first reply (on the day it was at then), and whether its
  // email bounced (and nothing came back)
  // (and who opened: each contact whose email was, how often)
  email: { sent: boolean; tracked: boolean; opens: number; openedBy: { by: string; address: string; opens: number }[]; replied: (Mark & { by: string; address: string }) | null; bounced: boolean };
  // Instagram and LinkedIn, marked by hand
  marks: Marks;
  // the platforms it has been reached on (reachedOn)
  reachedOn: Platform[];
  // its first reach out and each move on from day to day (reachOutDays)
  reachOuts: ReachOuts;
  // the message picked for a day (or stage) with more than one, by phase key
  picks: Record<string, string>;
  // messages approved as ready to send, by message and person ("msgId@c2")
  approvals: Record<string, Approval>;
  // it has been in Ready to reach out or later, by its record, or emailed
  reached: boolean;
  stageSince: string;
  createdAt: string;
  // who last changed its details, and when
  editedByName: string | null;
  editedAt: string | null;
};
export type Draft = { subject: string; body: string };
export type Approval = { by: string; at: string };
export type Opener = { label: string; drafts: Record<string, Draft> };
// A lead's own wording, loaded when it's opened (a board of 300 doesn't
// carry every lead's messages): messages rewritten for it alone, by message
// id, and the messages written for it ahead, by opener (main, then backups)
export type Prepared = { drafts: Record<string, Draft>; openers: Opener[] };
// The opener a lead's messages use: the one picked, else its main one
export const openerIndex = (p: Pick<Prepared, "openers">, picks: Record<string, string>): number => (p.openers[Number(picks.opener)] ? Number(picks.opener) : 0);
export const openerOf = (p: Pick<Prepared, "openers">, picks: Record<string, string>): Opener | undefined => p.openers[openerIndex(p, picks)];
// Where a message rewritten for this lead is kept: under the opener in use
// when that opener wrote it ("msgId#1"), so each opener keeps its own edit
// and Days 1 and 2 still change with the opener; else under the message alone
export const draftKey = (p: Prepared, picks: Record<string, string>, messageId: string): string => (p.openers.length > 1 && openerOf(p, picks)?.drafts[messageId] ? `${messageId}#${openerIndex(p, picks)}` : messageId);
// A message as this lead has it: rewritten for it (for the opener in use,
// then on its own), else written for it ahead (by the opener in use), else the template
export const preparedFor = (p: Prepared, picks: Record<string, string>, messageId: string): Draft | undefined => p.drafts[draftKey(p, picks, messageId)] ?? p.drafts[messageId] ?? openerOf(p, picks)?.drafts[messageId];
// The key of the rewrite shown for a message (the opener's own, else the message's), if any
export const shownDraftKey = (p: Prepared, picks: Record<string, string>, messageId: string): string | null => {
  const k = draftKey(p, picks, messageId);
  return p.drafts[k] ? k : p.drafts[messageId] ? messageId : null;
};
export type MessageData = { id: string; stageId: string; name: string; channel: string; subject: string; body: string; note: string };
export type SentData = { id: string; messageId: string | null; stageName: string; name: string; channel: string; subject: string; body: string; byName: string; sentAt: string };
export type BoardData = { id: string; name: string; slug: string; stages: StageData[]; fields: FieldData[]; leads: LeadData[]; messages: MessageData[] };
export type LeadEventData = {
  id: string;
  kind: string;
  summary: string;
  fromStage: string | null;
  toStage: string | null;
  reason: string | null;
  byName: string;
  createdAt: string;
};
export type TrashItem = { id: string; kind: string; title: string; reason: string; byName: string; deletedAt: string; restoredAt: string | null };
// a section or portal shown as a card on its parent's page
export type SpaceCard = { id: string; name: string; slug: string; kind: SpaceKind; href: string; children: number; leads: number };

// ---- The move rule ----
// One step forward is free. Going back, or jumping ahead past a stage,
// needs a reason (it stays on the lead's record).
export function moveNeedsReason(order: string[], from: string, to: string): boolean {
  if (from === to) return false;
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return true;
  return b !== a + 1;
}

// ---- Values ----
// A value as posted, checked and cleaned for its kind, or an error. Tags
// must be the field's own; empty values come back as null (cleared).
export function cleanValue(kind: FieldKind, raw: unknown, optionIds: string[] = []): { value: FieldValue } | { error: string } {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  switch (kind) {
    case "select":
    case "multi": {
      if (raw == null) return { value: null };
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) return { error: "Pick from the list." };
      const ids = [...new Set(raw as string[])];
      if (ids.some((id) => !optionIds.includes(id))) return { error: "That tag no longer exists. Refresh and try again." };
      if (kind === "select" && ids.length > 1) return { error: "Pick one tag." };
      return { value: ids.length ? ids : null };
    }
    case "count": {
      if (raw == null) return { value: null };
      const r = raw as Partial<CountValue>;
      const n = r.n == null || (r.n as unknown) === "" ? null : Number(r.n);
      if (n != null && (!Number.isInteger(n) || n < 0 || n > 9999)) return { error: "Use a whole number." };
      const remark = str(r.remark, 2000);
      return { value: n == null && !remark ? null : { n, remark } };
    }
    case "contacts": {
      if (raw == null) return { value: null };
      if (!Array.isArray(raw)) return { error: "Those contacts couldn't be read." };
      if (raw.length > 50) return { error: "That's more people than a lead can hold." };
      const people: Contact[] = raw.map((p, i) => {
        const c = (p ?? {}) as Partial<Contact>;
        const channels = Array.isArray(c.channels) ? c.channels : [];
        return {
          id: str(c.id, 64) || `c${i + 1}`,
          name: str(c.name, 120),
          role: str(c.role, 60),
          channels: channels
            .filter((ch) => isChannel(ch?.kind))
            .map((ch) => ({ kind: ch.kind, value: str(ch.value, 300) }))
            .slice(0, 100),
        };
      });
      return { value: people.length ? people : null };
    }
    case "links": {
      if (raw == null) return { value: null };
      if (!Array.isArray(raw)) return { error: "Those links couldn't be read." };
      const links = raw
        .map((l) => ({ label: str(l?.label, 80), url: str(l?.url, 600) }))
        .filter((l) => l.url || l.label)
        .slice(0, 50);
      return { value: links.length ? links : null };
    }
    case "checkbox":
      return { value: raw === true ? true : null };
    case "date": {
      if (raw == null || raw === "") return { value: null };
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: "Pick a date." };
      return { value: raw };
    }
    case "text": {
      const t = str(raw, 5000);
      return { value: t || null };
    }
  }
}

// Whether a value counts as filled in (for a lead's basic details)
export function isFilled(kind: FieldKind, v: unknown): boolean {
  if (v == null || v === "" || v === false) return false;
  if (kind === "count") {
    const c = v as CountValue;
    return c.n != null;
  }
  if (kind === "contacts") return (v as Contact[]).some((p) => p.name || p.channels.some((ch) => ch.value));
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// ---- Board filters ----
// What a board can be filtered on: each property's values that its leads
// actually have, with how many have each. Ticking values within a property
// means any of them; across properties, all must hold.
export type FacetKind = "tag" | "contact" | "range" | "text" | "checkbox";
export type FacetValue = { key: string; label: string; count: number };
export type Facet = { field: string; name: string; kind: FacetKind; values: FacetValue[] };
// picked value keys, by field id
export type FacetPicks = Record<string, string[]>;

const REACH = ["email", "instagram", "linkedin", "youtube", "phone"] as const;
const REACH_LABEL: Record<string, string> = { email: "Has email", instagram: "Has Instagram", linkedin: "Has LinkedIn", youtube: "Has YouTube", phone: "Has phone", none: "No way to reach them" };
const RANGES = [
  { label: "Under 1K", min: 0 },
  { label: "1K to 10K", min: 1e3 },
  { label: "10K to 100K", min: 1e4 },
  { label: "100K to 1M", min: 1e5 },
  { label: "1M and more", min: 1e6 },
];
const MULT: Record<string, number> = { "": 1, k: 1e3, m: 1e6, b: 1e9 };
// a text property with more distinct values than this is free text
const MAX_TEXT_VALUES = 12;

// A number as it's typed on a lead: "20,400", "352", "2.2K", "1.1M", "10K+"
export function parseAmount(text: string): number | null {
  const m = /^(\d*\.?\d+)\s*([kmb]?)\+?$/i.exec(text.trim().replace(/,/g, ""));
  return m ? Math.round(Number(m[1]) * MULT[m[2].toLowerCase()]) : null;
}

const textOf = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// How a property is filtered, from its kind and (for text) what its leads hold
function facetKind(f: Pick<FieldData, "name" | "kind">, vals: unknown[]): FacetKind | null {
  // Meme board only picks Day 6's image, so it isn't offered as a filter (it confused)
  if (/^meme board$/i.test(f.name.trim())) return null;
  if (f.kind === "select" || f.kind === "multi") return "tag";
  if (f.kind === "contacts") return "contact";
  if (f.kind === "checkbox") return "checkbox";
  if (f.kind === "count") return "range";
  if (f.kind !== "text") return null; // links and dates
  const texts = vals.map(textOf).filter(Boolean);
  // mostly numbers ("20,400", "2.2K"): by size, the odd word left out
  if (texts.filter((t) => parseAmount(t) != null).length * 2 > texts.length) return "range";
  return new Set(texts).size <= MAX_TEXT_VALUES ? "text" : null;
}

// The values one lead's property falls under
function facetKeys(kind: FacetKind, v: unknown): string[] {
  if (kind === "tag") return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  if (kind === "checkbox") return [v === true ? "yes" : "no"];
  if (kind === "text") return textOf(v) ? [textOf(v)] : [];
  if (kind === "contact") {
    const people = Array.isArray(v) ? (v as Contact[]) : [];
    const has = REACH.filter((k) => people.some((p) => p?.channels?.some((c) => c.kind === k && c.value?.trim())));
    return has.length ? has : ["none"];
  }
  const n = typeof v === "string" ? parseAmount(v) : typeof (v as CountValue | null)?.n === "number" ? (v as CountValue).n : null;
  return n == null ? [] : [String(RANGES.filter((r) => n >= r.min).length - 1)];
}

// Every property's values across these leads, each with its count, in the
// property's own order (tags as the board lists them, sizes small to big,
// text values most common first); a property no lead has a value in is left out
export function facets(leads: Pick<LeadData, "values">[], fields: Pick<FieldData, "id" | "name" | "kind" | "options">[]): Facet[] {
  return fields.flatMap((f) => {
    const kind = facetKind(f, leads.map((l) => l.values[f.id]));
    if (!kind) return [];
    const counts = new Map<string, number>();
    for (const l of leads) for (const k of facetKeys(kind, l.values[f.id])) counts.set(k, (counts.get(k) ?? 0) + 1);
    const labels: [string, string][] =
      kind === "tag" ? f.options.map((o) => [o.id, o.name])
      : kind === "contact" ? [...REACH, "none"].map((k) => [k, REACH_LABEL[k]])
      : kind === "range" ? RANGES.map((r, i) => [String(i), r.label])
      : kind === "checkbox" ? [["yes", "Checked"], ["no", "Not checked"]]
      : [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b)).map((k) => [k, k]);
    const values = labels.flatMap(([key, label]) => (counts.get(key) ? [{ key, label, count: counts.get(key)! }] : []));
    return values.length ? [{ field: f.id, name: f.name, kind, values }] : [];
  });
}

// Whether a lead holds one of the picked values in every property picked in
export function passesFacets(values: Record<string, unknown>, picks: FacetPicks, groups: Facet[]): boolean {
  return groups.every((g) => !picks[g.field]?.length || facetKeys(g.kind, values[g.field]).some((k) => picks[g.field].includes(k)));
}

// ---- Messages ----
// A stage's message is fixed text with {{Variables}} each lead fills in:
// "Hey {{Name}}, watched your {{Guest}} episode".
// LinkedIn takes at most 300 characters a message
export const LINKEDIN_LIMIT = 300;
export const overLimit = (channel: string, text: string) => channel === "linkedin" && text.length > LINKEDIN_LIMIT;

export const MESSAGE_CHANNELS = [
  { kind: "email", label: "Email" },
  { kind: "instagram", label: "Instagram" },
  { kind: "linkedin", label: "LinkedIn" },
  { kind: "other", label: "Other" },
] as const;
const VAR = /\{\{\s*([^{}]+?)\s*\}\}/g;

// The variables a set of texts use, each once, in order of first use
export function variablesIn(texts: string[]): string[] {
  const seen: string[] = [];
  for (const t of texts) for (const m of t.matchAll(VAR)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

// What a lead's messages know without asking: Name is its first contact's
// first name, Podcast its own name. Anything typed on the lead wins.
export function leadVars(lead: { title: string; values: Record<string, unknown>; vars: Record<string, string> }, fields: Pick<FieldData, "id" | "kind">[]): Record<string, string> {
  const first = leadContacts(lead.values, fields).find((c) => c.name.trim())?.name.trim().split(/\s+/)[0];
  const auto: Record<string, string> = { Podcast: lead.title };
  if (first) auto.Name = first;
  const typed = Object.fromEntries(Object.entries(lead.vars ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  return { ...auto, ...typed };
}

// A day's stage renamed: it keeps its "Day N" whatever it's now called, or it
// would leave the sequence and its messages with it (Abhishek renamed Day 1
// to "Anime" and it vanished, 17 Oct 2026). Any other stage takes the name.
export function keepDay(current: string, next: string): string {
  const day = dayOf(current);
  if (day == null || dayOf(next) === day) return next;
  const words = next.replace(/^\s*day\s*\d+\s*·?\s*/i, "").trim();
  return words ? `Day ${day} · ${words}` : `Day ${day}`;
}

// "Day 3 · Email 2" is day 3; a stage outside the sequence has no day
export function dayOf(stageName: string): number | null {
  const m = /^Day (\d+)\b/.exec(stageName);
  return m ? Number(m[1]) : null;
}

// ---- Reaching out ----
// Ready to reach out: the stage just before Day 1, where reaching out
// starts. -1 on a board without a day sequence.
export function outreachStart(stages: Pick<StageData, "name">[]): number {
  const first = stages.findIndex((s) => dayOf(s.name) != null);
  return first - 1;
}
export const isDead = (stageName: string) => /^dead\b/i.test(stageName.trim());
export const isReplied = (stageName: string) => /^replied\b/i.test(stageName.trim());

// The board in sections, a row of stages each (Abhishek, 9 and 12 Oct
// 2026): In process, from the first stage to the sequence's last day, and
// Dead; Replied, the rest (Audit sent, Replied, No reply after the audit,
// Parked for later). null on a board without a day sequence.
export const SECTIONS = { process: "In process", replied: "Replied" } as const;
export type Section = keyof typeof SECTIONS;
export function stageSections(stages: Pick<StageData, "name">[]): Section[] | null {
  const last = stages.map((s) => dayOf(s.name) != null).lastIndexOf(true);
  if (last < 0) return null;
  return stages.map((s, i) => (i <= last || isDead(s.name) ? "process" : "replied"));
}

// From Day 1 on, a lead's opens and replies show (its card and timeline)
export function tracksOutreach(stages: Pick<StageData, "id" | "name">[], lead: Pick<LeadData, "stageId" | "reached">): boolean {
  const first = stages.findIndex((s) => dayOf(s.name) != null);
  const i = stages.findIndex((s) => s.id === lead.stageId);
  if (first < 0 || i < first) return false;
  return !isDead(stages[i].name) || lead.reached;
}
// The platforms a lead is reached on. Email counts what went out of the
// sales inbox, automatically (opens, replies); Instagram and LinkedIn are
// marked by hand, seen and replied, once each (the day it was marked kept).
export const PLATFORMS = ["email", "instagram", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const MARKED = ["instagram", "linkedin"] as const;
export type Marked = (typeof MARKED)[number];
export type Mark = { day: string; at: string };
// What's tapped on Instagram and LinkedIn: on LinkedIn, Accepted (they took
// the connection request) comes first, and Reply only counts after it
// (Abhishek, 17 Oct 2026). Seen is kept for older marks.
export const MARK_KINDS = ["accepted", "seen", "replied"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export type PlatformMarks = Partial<Record<MarkKind, Mark>>;
// Per contact (17 Oct 2026): each person on the lead has their own marks on
// each platform, by the contact's id. A lead with no contacts marks as itself.
export type Marks = Record<string, Partial<Record<Marked, PlatformMarks>>>;
export type MarkChange = { contact: string; platform: Marked; kind: MarkKind; day: string | null };
export const NO_CONTACT = "_";
export const PLATFORM_NAME: Record<Platform, string> = { email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

// a mark set on a day, or cleared (day null). Clearing Accepted clears that
// contact's LinkedIn reply with it: a reply needs the request taken.
export function withMark(marks: Marks, c: MarkChange, at = new Date().toISOString()): Marks {
  const mine = { ...(marks[c.contact] ?? {}) };
  const one = { ...(mine[c.platform] ?? {}) };
  if (c.day) one[c.kind] = { day: c.day, at };
  else {
    delete one[c.kind];
    if (c.kind === "accepted") delete one.replied;
  }
  return { ...marks, [c.contact]: { ...mine, [c.platform]: one } };
}

// Marks as stored before 17 Oct 2026 were by platform alone
// ({ instagram: { replied } }); read, they belong to the lead's first contact.
export function readMarks(raw: unknown, firstContact: string): Marks {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacy = MARKED.filter((p) => p in m);
  if (!legacy.length) return m as Marks;
  const rest = Object.fromEntries(Object.entries(m).filter(([k]) => !legacy.includes(k as Marked))) as Marks;
  return { ...rest, [firstContact]: { ...(rest[firstContact] ?? {}), ...Object.fromEntries(legacy.map((p) => [p, m[p]])) } };
}

// a platform's mark on any contact (the first found)
export function markAny(marks: Marks, p: Marked, kind: MarkKind): Mark | undefined {
  return Object.values(marks).map((c) => c?.[p]?.[kind]).find((x): x is Mark => !!x);
}

// A lead's people, from its contacts fields
export function leadContacts(values: Record<string, unknown>, fields: Pick<FieldData, "id" | "kind">[]): Contact[] {
  return fields.filter((f) => f.kind === "contacts").flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as Contact[]) : []));
}
// the ones the lead window has a tab for: a name, or a way to reach them (an empty row is no one)
export const leadPeople = (values: Record<string, unknown>, fields: Pick<FieldData, "id" | "kind">[]) => leadContacts(values, fields).filter((c) => c.name.trim() || c.channels.some((ch) => ch.value.trim()));

// Whether a contact can be reached on a platform: a handle (or address) for
// it. A day's message on a platform the contact has no handle for shows
// greyed, with nothing to tap (Abhishek, 17 Oct 2026). No contact: open.
export const hasChannel = (c: Contact | null, platform: string) => !c || c.channels.some((ch) => ch.kind === platform && !!ch.value.trim());

// A pick (or anything kept per day) belongs to one contact: "day-1@c2"
export const forContact = (key: string, contact: Contact | null) => (contact ? `${key}@${contact.id}` : key);

export const messagesOnDay = <M extends Pick<MessageData, "stageId">>(board: { stages: Pick<StageData, "id" | "name">[]; messages: M[] }, day: number) =>
  board.messages.filter((m) => dayOf(board.stages.find((s) => s.id === m.stageId)?.name ?? "") === day);

// the platforms marked by hand that a day's messages go out on
export function markedOn(board: Pick<BoardData, "stages" | "messages">, day: number): Marked[] {
  return MARKED.filter((p) => messagesOnDay(board, day).some((m) => m.channel === p));
}

// A day's message before one is picked: the one for whether its email was
// opened ("Already opened Email 1" or "Didn't open Email 1"), else the first
// (Email on Day 1)
export function defaultMessage<T extends Pick<MessageData, "name">>(options: T[], opened: boolean): T | undefined {
  return options.find((m) => (opened ? /already opened/i : /didn.?t open/i).test(m.name)) ?? options[0];
}

// A day's default for one contact: among the messages they can be reached
// with (Day 1 is LinkedIn for someone with no email), else the day's own
export function defaultFor<T extends Pick<MessageData, "name" | "channel">>(options: T[], contact: Contact | null, opened: boolean): T | undefined {
  const can = options.filter((m) => hasChannel(contact, m.channel));
  return defaultMessage(can.length ? can : options, opened);
}

// The message a contact's day goes out with: the one picked for them, else
// the lead's, else their default
export function chosenFor<T extends Pick<MessageData, "id" | "name" | "channel">>(options: T[], picks: Record<string, string>, key: string, contact: Contact | null, opened: boolean): T | undefined {
  return options.find((m) => m.id === picks[forContact(key, contact)]) ?? (contact ? options.find((m) => m.id === picks[key]) : undefined) ?? defaultFor(options, contact, opened);
}

// The platform a contact's day goes out on, so the card shows only that
// platform's buttons
export function dayPlatform(board: Pick<BoardData, "stages" | "messages">, picks: Record<string, string>, day: number, opened = false, contact: Contact | null = null): string | null {
  return chosenFor(messagesOnDay(board, day), picks, `day-${day}`, contact, opened)?.channel ?? null;
}

// ---- Approvals ----
// The messages an opener writes itself: the ones its lead's openers word
// differently. Every opener carries every message; only Days 1 and 2 differ.
export function openerOwn(openers: Opener[]): Set<string> {
  const said = (o: Opener, id: string) => JSON.stringify([o.drafts?.[id]?.subject, o.drafts?.[id]?.body]);
  const ids = new Set(openers.flatMap((o) => Object.keys(o.drafts ?? {})));
  return new Set([...ids].filter((id) => openers.some((o) => said(o, id) !== said(openers[0], id))));
}
// Where a message's approval for a person is kept: an opener's own message
// under that opener (the one in use unless said), "msgId#1@c2", so each
// opener is approved on its own; with one opener, every message it carries
// under it ("msgId#0@c2"), so a backup added later starts unapproved; any
// other under the message, "msgId@c2"
export const approvalKey = (p: Pick<Prepared, "openers">, picks: Record<string, string>, messageId: string, contact: Contact | null, opener = openerIndex(p, picks)) => {
  const scoped = openerOwn(p.openers).has(messageId) || (p.openers.length === 1 && !!p.openers[0].drafts?.[messageId]);
  return forContact(scoped ? `${messageId}#${opener}` : messageId, contact);
};
// The keys an approval is read from (and taken off with): its own, then the
// one standing for it: for an opener's, one from before openers had their
// own; for a message every opener words alike, the main opener's
export const approvalKeys = (key: string) => [key, key.includes("#") ? key.replace(/#\d+/, "") : key.replace(/^[^@]+/, "$&#0")];
export const approvalIn = (approvals: Record<string, Approval | null | undefined>, key: string) => approvalKeys(key).map((k) => approvals[k]).find((a) => !!a) ?? null;

// What's still to approve before a lead goes into Ready to reach out
// (Abhishek, 23 Oct 2026): for each person on it (none: the lead itself),
// each day's message on each platform, as the day strip picks it, that they
// can be reached on. A day with nothing they can be reached by passes.
// Picked by whether its email was opened, as the day strip does (a lead
// moved back can have been).
// message null: the person can't be reached at all (no contact, or none of
// the channels the sequence writes on), so there is nothing to approve yet
export type Unapproved = { day: number; message: Pick<MessageData, "id" | "name"> | null; contact: Contact | null };
// needsContact: the board keeps people on its leads (a contacts property), so a
// lead with nobody on it, or someone with no handle the messages go to, can't
// go on to Ready to reach out: approving nothing would pass (Abhishek, 23 Oct 2026)
export function approvalsMissing(
  board: { stages: Pick<StageData, "id" | "name">[]; messages: Pick<MessageData, "id" | "stageId" | "name" | "channel">[] },
  lead: { picks: Record<string, string>; approvals: Record<string, Approval | null | undefined> },
  openers: Opener[],
  contacts: Contact[],
  opened = false,
  needsContact = false,
): Unapproved[] {
  const days = [...new Set(board.stages.map((s) => dayOf(s.name)).filter((d): d is number => d != null))].sort((a, b) => a - b);
  const missing: Unapproved[] = [];
  if (needsContact && !contacts.length && days.length) return [{ day: 0, message: null, contact: null }];
  const sent = board.messages.filter((m) => dayOf(board.stages.find((s) => s.id === m.stageId)?.name ?? "") != null);
  for (const contact of contacts.length ? contacts : [null]) {
    if (needsContact && contact && sent.length && !sent.some((m) => hasChannel(contact, m.channel))) {
      missing.push({ day: 0, message: null, contact });
      continue;
    }
    for (const day of days) {
      const on = messagesOnDay(board, day);
      for (const channel of new Set(on.map((m) => m.channel))) {
        const options = on.filter((m) => m.channel === channel);
        const m = chosenFor(options, lead.picks, `day-${day}`, contact, opened) ?? options[0];
        if (hasChannel(contact, m.channel) && !approvalIn(lead.approvals, approvalKey({ openers }, lead.picks, m.id, contact))) missing.push({ day, message: m, contact });
      }
    }
  }
  return missing;
}
// Before Ready to reach out, where going on waits for every message to be
// approved: a stage before it, or Dead when the lead's record (the stages it
// was made or moved into) never had it in Ready to reach out or later, so
// Dead is no way round the approvals
export function beforeReady(stages: Pick<StageData, "id" | "name">[], stageId: string, record: (string | null)[]): boolean {
  const start = outreachStart(stages);
  if (start < 0) return false;
  const i = stages.findIndex((s) => s.id === stageId);
  if (i < start) return true;
  const later = new Set(stages.slice(start).filter((s) => !isDead(s.name)).map((s) => s.name));
  return isDead(stages[i].name) && !record.some((n) => !!n && (later.has(n) || dayOf(n) != null));
}
// Why it can't go on yet, as a sentence: "Approve every message first: Day 3
// · Email 2 for Dr Karandish and 4 more." or "Add an email, LinkedIn or
// Instagram for Dr Karandish first."
export function unapprovedText(missing: Unapproved[]): string {
  const unreachable = missing.find((m) => !m.message);
  if (unreachable) {
    const who = unreachable.contact?.name.trim();
    return unreachable.contact ? `Add an email, LinkedIn or Instagram${who ? ` for ${who}` : ""} first.` : "Add a contact first.";
  }
  const [{ day, message, contact }] = missing;
  const name = contact?.name.trim();
  const more = missing.length - 1;
  return `Approve every message first: Day ${day} · ${message!.name.replace(/^day \d+\s*·\s*/i, "")}${name ? ` for ${name}` : ""}${more ? ` and ${more} more` : ""}.`;
}

// The day the LinkedIn connection request goes out: the sequence's first
// LinkedIn message. Its marks are Accepted, then Reply.
export function requestDay(board: Pick<BoardData, "stages" | "messages">): number | null {
  const days = board.messages.filter((m) => m.channel === "linkedin").map((m) => dayOf(board.stages.find((s) => s.id === m.stageId)?.name ?? "")).filter((d): d is number => d != null);
  return days.length ? Math.min(...days) : null;
}

// Instagram and LinkedIn reached by a lead's record: from their first day
// on, by the furthest day it has been on (its stage and every move)
export function reachedByDay(board: Pick<BoardData, "stages" | "messages">, stageNames: (string | null)[]): Marked[] {
  const days = stageNames.map((n) => (n ? dayOf(n) : null)).filter((d): d is number => d != null);
  if (!days.length) return [];
  const furthest = Math.max(...days);
  return MARKED.filter((p) => [...Array(furthest).keys()].some((i) => markedOn(board, i + 1).includes(p)));
}

// A lead's reach outs from its record (9 Oct 2026, Abhishek): its first, the
// day it first came into the sequence (Ready to reach out to Day 1, or made
// in a day), and each move on from one day to a later one after it (Day 1 to
// 2, 2 to 3…), by the day moved to. A move back, or out, isn't one. A lead
// with no record of coming in (added by a script) came in on the day it's on.
export type ReachOuts = { first: number | null; next: number[] };

export function reachOutDays(events: { kind: string; fromStage: string | null; toStage: string | null }[], stageName: string | null): ReachOuts {
  const out: ReachOuts = { first: null, next: [] };
  for (const e of events) {
    const to = e.toStage ? dayOf(e.toStage) : null;
    if (to == null) continue;
    const from = e.kind === "moved" && e.fromStage ? dayOf(e.fromStage) : null;
    if (out.first == null) out.first = to;
    else if (from != null && to > from) out.next.push(to);
  }
  out.first ??= stageName ? dayOf(stageName) : null;
  return out;
}

// The board's reach outs, on every platform or one (a day counts for every
// platform it has a message on: Day 1's email and LinkedIn note both go out,
// as the lead window shows them): unique, the leads reached, each once;
// total, every reach out, the first (Ready to reach out to Day 1) and each
// move on from day to day (5 leads into Day 1, then on to 2 and to 3, make 15)
export function reachOutCounts(board: Pick<BoardData, "stages" | "messages">, leads: Pick<LeadData, "reachOuts" | "picks" | "email">[], platform: Platform | null) {
  let unique = 0;
  let total = 0;
  for (const l of leads) {
    const on = (d: number) => !platform || messagesOnDay(board, d).some((m) => m.channel === platform);
    const { first, next } = l.reachOuts;
    const reachedFirst = first != null && on(first);
    const moves = next.filter(on).length;
    total += moves + (reachedFirst ? 1 : 0);
    if (reachedFirst || moves) unique++;
  }
  return { unique, total };
}

// One platform for one lead: reached, opened (seen; a reply means it was
// read), replied. Email opens are only known where it was tracked.
type Tracked = Pick<LeadData, "email" | "marks" | "reachedOn">;
function onPlatform(l: Tracked, p: Platform) {
  if (p === "email") {
    const replied = !!l.email.replied;
    return { reached: l.reachedOn.includes("email"), known: l.email.tracked || replied, opened: l.email.opens > 0 || replied, replied };
  }
  // Instagram and LinkedIn are tapped, per contact: Accepted (LinkedIn's
  // request taken) and Replied. Whether they read it is known from a reply.
  const any = (k: MarkKind) => !!markAny(l.marks, p, k);
  const [accepted, seen, replied] = [any("accepted"), any("seen"), any("replied")];
  const reached = l.reachedOn.includes(p) || accepted || seen || replied;
  return { reached, known: seen || replied, opened: seen || replied, replied, accepted };
}

// The board's numbers, by lead, on one platform or on all (null): reached
// there, opened there, replied there; on LinkedIn, how many took the
// request. On all, a lead counts once.
export function outreachStats(leads: Tracked[], platform: Platform | null) {
  const per = leads.map((l) => (platform ? [platform] : PLATFORMS).map((p) => onPlatform(l, p)).filter((s) => s.reached)).filter((s) => s.length);
  const count = (key: "known" | "opened" | "replied" | "accepted") => per.filter((s) => s.some((x) => x[key])).length;
  const rate = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const [known, opened, replied, accepted] = [count("known"), count("opened"), count("replied"), count("accepted")];
  return { reached: per.length, opened, replied, accepted, openRate: rate(opened, known), replyRate: rate(replied, per.length), acceptRate: rate(accepted, per.length) };
}

// every email address in a lead's details (its contacts' emails), for
// matching it to the sales inbox (org/space/data.ts, lib/mailReport.ts)
const EMAILS = /[^\s"'<>,;:]+@[^\s"'<>,;:]+\.[a-z]{2,}/gi;
export const leadEmails = (values: unknown) => [...new Set((JSON.stringify(values ?? {}).match(EMAILS) ?? []).map((e) => e.toLowerCase()))];

// A day's (or a stage's) key: one for every stage of a day ("day-7"), else the stage's own
export const phaseKey = (stage: Pick<StageData, "id" | "name">) => {
  const d = dayOf(stage.name);
  return d == null ? stage.id : `day-${d}`;
};

// A lead's messages, a phase per day, for its timeline. Before Ready to
// reach out (Dream List) it has none. In Ready to reach out
// every day shows, Day 1 next, so all of it is ready.
// On a day, the days before it (done), that day (now) and the next one
// show. Outside the sequence
// (the replies, the audit), a stage shows its own.
export type Phase = { key: string; title: string; day: number | null; when: "done" | "now" | "next" | null; messages: MessageData[] };
export function messagePhases(board: Pick<BoardData, "stages" | "messages">, stageId: string): Phase[] {
  const { stages } = board;
  const i = stages.findIndex((s) => s.id === stageId);
  if (i < 0) return [];
  const first = stages.findIndex((s) => dayOf(s.name) != null);
  const here = dayOf(stages[i].name);
  const days = [...new Set(stages.map((s) => dayOf(s.name)).filter((d): d is number => d != null))].sort((a, b) => a - b);
  const outside = first < 0 || (here == null && i > first);
  if (!outside && i < first - 1) return [];
  const ahead = !outside && i < first;
  const next = here == null ? days[0] : days.find((d) => d > here);
  const picked = outside ? [stages[i]] : stages.filter((s) => {
    const d = dayOf(s.name);
    return d != null && (ahead || (here != null && d <= here) || d === next);
  });
  const phases: Phase[] = [];
  for (const s of picked) {
    const d = dayOf(s.name);
    const key = phaseKey(s);
    let p = phases.find((x) => x.key === key);
    if (!p) {
      const when = outside || (d != null && d === here) ? "now" : d === next ? "next" : d != null && here != null && d < here ? "done" : null;
      p = { key, title: d == null ? s.name : `Day ${d}`, day: d, when, messages: [] };
      phases.push(p);
    }
    p.messages.push(...board.messages.filter((m) => m.stageId === s.id));
  }
  return phases.filter((p) => p.messages.length);
}

// A lead's messages as tabs along the top of its window, as the Dream 300
// sequence pages show them (17 Oct 2026): every day of the sequence from
// Ready to reach out on, each done, today or next by the stage it's on, and
// a stage past the sequence with messages of its own (Replied…) as its own
// tab. Before Ready to reach out every day shows too, nothing marked yet, so
// a lead's messages can be read from the start (Abhishek, 17 Oct 2026). A
// board with no days: its stage's own messages, if any.
export type SequenceTab = { key: string; title: string; sub: string; stage: StageData; day: number | null; when: "done" | "now" | "next" | null; messages: MessageData[] };
const CHANNEL_WORD: Record<string, string> = { email: "Email", linkedin: "LinkedIn", instagram: "Instagram", other: "Other" };
export function sequenceTabs(board: Pick<BoardData, "stages" | "messages">, stageId: string): SequenceTab[] {
  const { stages } = board;
  const i = stages.findIndex((s) => s.id === stageId);
  if (i < 0) return [];
  const own = (st: StageData): SequenceTab[] => {
    const messages = board.messages.filter((m) => m.stageId === st.id);
    return messages.length ? [{ key: st.id, title: st.name, sub: st.name, stage: st, day: null, when: "now", messages }] : [];
  };
  const first = stages.findIndex((s) => dayOf(s.name) != null);
  if (first < 0) return own(stages[i]);
  const before = i < first - 1;
  const here = dayOf(stages[i].name);
  const past = here == null && i > first;
  const days = [...new Set(stages.map((s) => dayOf(s.name)).filter((d): d is number => d != null))].sort((a, b) => a - b);
  const next = past || before ? null : here == null ? days[0] : days.find((d) => d > here);
  const tabs: SequenceTab[] = days.map((d) => {
    const on = stages.filter((s) => dayOf(s.name) === d);
    const messages = board.messages.filter((m) => on.some((s) => s.id === m.stageId));
    const named = on.find((s) => s.name.includes("·"));
    const sub = named?.name ?? `Day ${d} · ${[...new Set(messages.map((m) => CHANNEL_WORD[m.channel] ?? m.channel))].join(" + ")}`;
    const when = past || (here != null && d < here) ? "done" : d === here ? "now" : d === next ? "next" : null;
    return { key: `day-${d}`, title: `Day ${d}`, sub, stage: named ?? on[0], day: d, when, messages };
  });
  return [...tabs.filter((t) => t.messages.length), ...(past ? own(stages[i]) : [])];
}

// What a link is called on a lead: short and plain (Abhishek, 17 Oct 2026:
// "YouTube", not "YouTube channel"). The words after a platform go
// ("channel", "page", "profile"), a video or reel is just that, and a link
// with no name is called after its site.
export function linkName(label: string, url: string): string {
  const l = label.trim().replace(/\s+/g, " ");
  if (!l) return siteName(url);
  // "Notion page", "Notion page (YT 1)", "Notion page 2": all "Notion" (two on one lead are numbered where they show)
  if (/^notion page\b/i.test(l)) return "Notion";
  const kind = /^(video|reel|post)(\s|$)/i.exec(l);
  if (kind) return kind[1].charAt(0).toUpperCase() + kind[1].slice(1).toLowerCase();
  return l.replace(/^(youtube|instagram|linkedin|facebook|tiktok|x|twitter|spotify)\s+(channel|page|profile|account)$/i, "$1");
}
function siteName(url: string): string {
  const u = url.trim();
  if (/^(mailto|tel):/i.test(u)) return u.replace(/^(mailto|tel):/i, "");
  const host = /^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i.exec(u)?.[1]?.toLowerCase() ?? "";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return /youtu\.be|\/(watch|shorts)\b/i.test(u) ? "Video" : "YouTube";
  if (/(^|\.)instagram\.com$/.test(host)) return /\/(reel|p)\//i.test(u) ? "Post" : "Instagram";
  if (/(^|\.)linkedin\.com$/.test(host)) return "LinkedIn";
  if (/(^|\.)notion\.(so|site)$/.test(host)) return "Notion";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "X";
  return host || "Link";
}

// The handle a page is known by, shown small beside its name ("@drtimpearce",
// "in/drtimpearce", a website's host); nothing for a single video, reel or
// post, a Notion page, or a channel id.
export function handleOf(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/^mailto:/i.test(u)) return u.replace(/^mailto:/i, "");
  if (/^tel:/i.test(u)) return u.replace(/^tel:/i, "");
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?([^/?#]+)(?:\/([^?#]*))?/i.exec(u);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const parts = (m[2] ?? "").split("/").filter(Boolean);
  const at = (h: string | undefined) => (h && /^[\w.-]+$/.test(h.replace(/^@/, "")) ? `@${h.replace(/^@/, "")}` : null);
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
    if (host === "youtu.be" || ["watch", "shorts", "playlist", "embed"].includes(parts[0] ?? "")) return null;
    if (parts[0]?.startsWith("@")) return at(parts[0]);
    if (["c", "user"].includes(parts[0] ?? "")) return at(parts[1]);
    return null;
  }
  if (/(^|\.)instagram\.com$/.test(host)) return ["p", "reel", "reels", "stories", "explore"].includes(parts[0] ?? "") ? null : at(parts[0]);
  if (/(^|\.)(tiktok\.com|x\.com|twitter\.com|threads\.net)$/.test(host)) return at(parts[0]);
  if (/(^|\.)linkedin\.com$/.test(host)) return ["in", "company", "school"].includes(parts[0] ?? "") && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  if (/(^|\.)(notion\.(so|site)|linktr\.ee)$/.test(host)) return null;
  return host;
}

// What to call each of a day's messages when picking one: its platform when
// they differ (Day 1: Email, LinkedIn), else the last part of its name
// (Day 2: "Didn't open Email 1", "Already opened Email 1")
const PLATFORM_WORDS: Record<string, string> = { email: "Email", linkedin: "LinkedIn", instagram: "Instagram" };
export function optionLabel(messages: Pick<MessageData, "channel" | "name">[], m: Pick<MessageData, "channel" | "name">): string {
  const channels = new Set(messages.map((x) => x.channel));
  if (channels.size === messages.length) return PLATFORM_WORDS[m.channel] ?? m.name;
  const last = m.name.split("·").pop()!.trim().toLowerCase();
  const words = last.replace(/\b(email|linkedin|instagram)\b/g, (w) => PLATFORM_WORDS[w]);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// A board's messages in groups, in board order: each day of the sequence
// with all its stages together (Day 1's email and LinkedIn note), then every
// other stage that has messages (the replies, the audit…)
export function messageGroups(board: Pick<BoardData, "stages" | "messages">): { key: string; title: string; items: MessageData[] }[] {
  const groups: { key: string; title: string; items: MessageData[] }[] = [];
  for (const st of board.stages) {
    const items = board.messages.filter((m) => m.stageId === st.id);
    if (!items.length) continue;
    const day = dayOf(st.name);
    const key = day == null ? st.id : `day-${day}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(...items);
    else groups.push({ key, title: day == null ? st.name : `Day ${day}`, items });
  }
  return groups;
}

// A message split into its fixed text and its variables, filled where known
export function fillParts(text: string, vars: Record<string, string>): ({ text: string } | { name: string; value: string | null })[] {
  const parts: ({ text: string } | { name: string; value: string | null })[] = [];
  let at = 0;
  for (const m of text.matchAll(VAR)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ name: m[1], value: vars[m[1]] ?? null });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

// The message as it would go out: variables filled, unknown ones left as {{Name}}
export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(VAR, (whole, name: string) => vars[name.trim()] ?? whole);
}

// A message edited as plain text, read back against the wording it was filled
// from (Abhishek, 23 Oct 2026). A change inside one variable's value is that
// value's new wording: the Fill in form and every message take it (typing over
// a {{Link}} still to fill fills it). Any other change is the lead's own copy,
// with every variable the edit didn't touch kept as its {{Variable}}, so the
// form still reaches it.
export type EditRead = { same: true } | { name: string; value: string } | { text: string };
type Hunk = { of: number; ot: number; ef: number; et: number };
const TOKEN = /[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu;
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

// where two texts differ, word by word, as stretches of each (from, to)
function textDiff(a: string, b: string): Hunk[] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const whole = [{ of: p, ot: a.length - q, ef: p, et: b.length - q }];
  const A = [...a.slice(p, a.length - q).matchAll(TOKEN)];
  const B = [...b.slice(p, b.length - q).matchAll(TOKEN)];
  const n = A.length;
  const m = B.length;
  // ponytail: plain LCS table over the changed middle only; one stretch when it's huge
  if (!n || !m || n * m > 4_000_000) return whole;
  const T = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) T[i * (m + 1) + j] = A[i][0] === B[j][0] ? T[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(T[(i + 1) * (m + 1) + j], T[i * (m + 1) + j + 1]);
  const hunks: Hunk[] = [];
  const posA = (i: number) => p + (i < n ? A[i].index : a.length - q - p);
  const posB = (j: number) => p + (j < m ? B[j].index : b.length - q - p);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i][0] === B[j][0]) {
      i++;
      j++;
      continue;
    }
    const h = { of: posA(i), ot: 0, ef: posB(j), et: 0 };
    while ((i < n || j < m) && !(i < n && j < m && A[i][0] === B[j][0])) {
      if (j >= m || (i < n && T[(i + 1) * (m + 1) + j] >= T[i * (m + 1) + j + 1])) i++;
      else j++;
    }
    hunks.push({ ...h, ot: posA(i), et: posB(j) });
  }
  return hunks;
}

// fixed: variables that can't change here (Name comes from the person picked)
export function readEdit(template: string, vars: Record<string, string>, edited: string, fixed: string[] = []): EditRead {
  // the text as it was shown, and where each variable sits in it (filled, or still {{Name}})
  let filled = "";
  let at = 0;
  const spans: { name: string; from: number; to: number }[] = [];
  for (const m of template.matchAll(VAR)) {
    filled += template.slice(at, m.index);
    const shown = vars[m[1]] ?? m[0];
    spans.push({ name: m[1], from: filled.length, to: filled.length + shown.length });
    filled += shown;
    at = m.index + m[0].length;
  }
  filled += template.slice(at);
  if (edited === filled) return { same: true };

  // a change sits inside a variable when it's within its words; typed at its
  // edge only when it carries on the same word ("Dr Kay" to "Dr Kaye", not
  // "lysine tablets" or "88K+")
  const inside = (s: { from: number; to: number }, h: Hunk) =>
    s.to > s.from &&
    (h.of < h.ot
      ? s.from <= h.of && h.ot <= s.to
      : (s.from < h.of && h.of < s.to) || (h.of === s.to && isWord(edited[h.ef]) && isWord(filled[h.of - 1])) || (h.of === s.from && isWord(edited[h.et - 1]) && isWord(filled[h.of])));
  const touches = (s: { from: number; to: number }, h: Hunk) => (h.of < h.ot ? h.of < s.to && h.ot > s.from : inside(s, h));

  // a word taken out or put in where the same letters repeat could sit in
  // more than one place: the place inside a variable, when there is one
  const hunks = textDiff(filled, edited).map((h, k, all) => {
    if (h.of < h.ot && h.ef < h.et) return h;
    const lo = k ? all[k - 1].ot : 0;
    const hi = k < all.length - 1 ? all[k + 1].of : filled.length;
    const text = h.of < h.ot ? filled : edited;
    const [f, t] = h.of < h.ot ? ["of", "ot"] as const : ["ef", "et"] as const;
    const tries = [h];
    for (let c = { ...h }; c.of > lo && text[c[f] - 1] === text[c[t] - 1]; ) tries.push((c = { of: c.of - 1, ot: c.ot - 1, ef: c.ef - 1, et: c.et - 1 }));
    for (let c = { ...h }; c.ot < hi && text[c[f]] === text[c[t]] && c[t] < text.length; ) tries.push((c = { of: c.of + 1, ot: c.ot + 1, ef: c.ef + 1, et: c.et + 1 }));
    return tries.find((c) => spans.some((s) => inside(s, c))) ?? h;
  });

  // every change inside the same one variable: its new value
  const hit = spans.filter((s) => hunks.some((h) => touches(s, h)));
  const only = hit.length === 1 ? hit[0] : null;
  if (only && !fixed.includes(only.name) && hunks.every((h) => inside(only, h))) {
    const shift = hunks.reduce((n, h) => n + (h.et - h.ef) - (h.ot - h.of), 0);
    const value = edited.slice(only.from, only.to + shift);
    if (value.trim() && !/[{}\n\r]/.test(value)) return { name: only.name, value };
  }
  // the lead's own copy: the variables no change touched stay variables
  let text = "";
  let from = 0;
  for (const s of spans) {
    if (hit.includes(s)) continue;
    const shift = hunks.filter((h) => h.ot <= s.from && !(h.of === h.ot && h.of === s.from && inside(s, h))).reduce((n, h) => n + (h.et - h.ef) - (h.ot - h.of), 0);
    text += edited.slice(from, s.from + shift) + `{{${s.name}}}`;
    from = s.to + shift;
  }
  return { text: text + edited.slice(from) };
}

// ---- Addresses ----
export function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  );
}
// a slug no sibling has yet: "podcast", then "podcast-2"…
export function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name);
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
}

// "3 days" since a moment, for "3 days in Day 2"
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

// ---- The Podcast portal's first board, as it stands in Notion (Dream 156
// Podcasts, Core Offer): its 19 stages and its properties ----
export type BoardTemplate = {
  name: string;
  stages: { name: string; color: ColorName }[];
  fields: { name: string; kind: FieldKind; onCard?: boolean; required?: boolean; options?: { name: string; color: ColorName }[] }[];
};
// one stage per day, as on the FigJam reply map: Day 1 (an email and a
// LinkedIn note) and Day 7 (Instagram and LinkedIn) each hold both messages
const DAYS = ["Day 1", "Day 2 · Instagram 1", "Day 3 · Email 2", "Day 4 · LinkedIn DM", "Day 5 · Instagram 2", "Day 6 · Email 3", "Day 7", "Day 8 · Email 4"].map((name) => ({
  name,
  color: "blue" as ColorName,
}));
export const DREAM_156: BoardTemplate = {
  name: "Dream 156 Podcasts (Core Offer)",
  stages: [
    { name: "Dream 156 list", color: "default" },
    { name: "Write-up done", color: "purple" },
    { name: "Ready to reach out", color: "cyan" },
    ...DAYS,
    { name: "Audit sent", color: "purple" },
    { name: "Replied", color: "green" },
    { name: "No reply after the audit", color: "orange" },
    { name: "Parked for later", color: "gray" },
    { name: "Dead", color: "red" },
  ],
  fields: [
    {
      name: "Trailer",
      kind: "select",
      onCard: true,
      required: true,
      options: [
        { name: "Yes", color: "blue" },
        { name: "Yes [ Average ]", color: "pink" },
        { name: "No", color: "green" },
      ],
    },
    {
      name: "Community capture",
      kind: "select",
      onCard: true,
      required: true,
      options: [
        { name: "Yes", color: "orange" },
        { name: "No", color: "green" },
      ],
    },
    { name: "Short-form quantity", kind: "count", onCard: true, required: true },
    {
      name: "Podcast cadence",
      kind: "select",
      onCard: true,
      required: true,
      options: [
        { name: "More than 5 episodes a month", color: "green" },
        { name: "4 episodes a month", color: "default" },
        { name: "2-3 episodes a month", color: "purple" },
        { name: "Around 2 episodes a month", color: "brown" },
        { name: "Less than 2 episodes a month", color: "red" },
      ],
    },
    { name: "Contacts", kind: "contacts", required: true },
    { name: "Podcast links", kind: "links" },
    {
      name: "Newsletter",
      kind: "select",
      options: [
        { name: "Yes", color: "red" },
        { name: "No", color: "green" },
        { name: "No but there is an email capture", color: "brown" },
      ],
    },
    {
      name: "Industry",
      kind: "select",
      options: ["Real Estate", "Recruitment", "Finance", "Coaching", "SAAS", "Tech", "Consulting", "VC", "Agency", "B2B Agency", "Health Care", "AI", "HR", "Energy", "Construction"].map(
        (name, i) => ({ name, color: COLOR_NAMES[(i % (COLOR_NAMES.length - 1)) + 1] }),
      ),
    },
  ],
};
