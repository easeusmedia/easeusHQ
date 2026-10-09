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
  // a tracked email went to it, how often its emails were opened, and its
  // first reply (on the day it was at then)
  email: { tracked: boolean; opens: number; replied: Mark | null };
  // Instagram and LinkedIn, marked by hand
  marks: Marks;
  // the platforms it has been reached on (reachedOn)
  reachedOn: Platform[];
  // the message picked for a day (or stage) with more than one, by phase key
  picks: Record<string, string>;
  // it has been in Ready to reach out or later, by its record, or emailed
  reached: boolean;
  // messages rewritten for this lead alone, by message id
  drafts: Record<string, Draft>;
  stageSince: string;
  createdAt: string;
  // who last changed its details, and when
  editedByName: string | null;
  editedAt: string | null;
};
export type Draft = { subject: string; body: string };
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

// The basic details a lead still lacks: its required properties not filled
export function missingDetails(fields: Pick<FieldData, "id" | "kind" | "required" | "name">[], values: Record<string, unknown>): string[] {
  return fields.filter((f) => f.required && !isFilled(f.kind, values[f.id])).map((f) => f.name);
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
  const contacts = fields.filter((f) => f.kind === "contacts").flatMap((f) => (Array.isArray(lead.values[f.id]) ? (lead.values[f.id] as Contact[]) : []));
  const first = contacts.find((c) => c.name.trim())?.name.trim().split(/\s+/)[0];
  const auto: Record<string, string> = { Podcast: lead.title };
  if (first) auto.Name = first;
  const typed = Object.fromEntries(Object.entries(lead.vars ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  return { ...auto, ...typed };
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
export type Marks = Partial<Record<Marked, { seen?: Mark; replied?: Mark }>>;
export type MarkChange = { platform: Marked; kind: "seen" | "replied"; day: string | null };
export const PLATFORM_NAME: Record<Platform, string> = { email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

// a mark set on a day, or cleared (day null)
export function withMark(marks: Marks, c: MarkChange, at = new Date().toISOString()): Marks {
  const one = { ...marks[c.platform] };
  if (c.day) one[c.kind] = { day: c.day, at };
  else delete one[c.kind];
  return { ...marks, [c.platform]: one };
}

// the platforms marked by hand that a day's messages go out on
export function markedOn(board: Pick<BoardData, "stages" | "messages">, day: number): Marked[] {
  const dayOfMessage = (m: Pick<MessageData, "stageId">) => dayOf(board.stages.find((s) => s.id === m.stageId)?.name ?? "");
  return MARKED.filter((p) => board.messages.some((m) => m.channel === p && dayOfMessage(m) === day));
}

// Instagram and LinkedIn reached by a lead's record: from their first day
// on, by the furthest day it has been on (its stage and every move)
export function reachedByDay(board: Pick<BoardData, "stages" | "messages">, stageNames: (string | null)[]): Marked[] {
  const days = stageNames.map((n) => (n ? dayOf(n) : null)).filter((d): d is number => d != null);
  if (!days.length) return [];
  const furthest = Math.max(...days);
  return MARKED.filter((p) => [...Array(furthest).keys()].some((i) => markedOn(board, i + 1).includes(p)));
}

// One platform for one lead: reached, opened (seen; a reply means it was
// read), replied. Email opens are only known where it was tracked.
type Tracked = Pick<LeadData, "email" | "marks" | "reachedOn">;
function onPlatform(l: Tracked, p: Platform) {
  if (p === "email") {
    const replied = !!l.email.replied;
    return { reached: l.reachedOn.includes("email"), known: l.email.tracked || replied, opened: l.email.opens > 0 || replied, replied };
  }
  const m = l.marks[p] ?? {};
  const reached = l.reachedOn.includes(p) || !!m.seen || !!m.replied;
  return { reached, known: reached, opened: !!m.seen || !!m.replied, replied: !!m.replied };
}

// The board's numbers, by lead, on one platform or on all (null): reached
// there, opened there, replied there. On all, a lead counts once.
export function outreachStats(leads: Tracked[], platform: Platform | null) {
  const per = leads.map((l) => (platform ? [platform] : PLATFORMS).map((p) => onPlatform(l, p)).filter((s) => s.reached)).filter((s) => s.length);
  const count = (key: "known" | "opened" | "replied") => per.filter((s) => s.some((x) => x[key])).length;
  const rate = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const [known, opened, replied] = [count("known"), count("opened"), count("replied")];
  return { reached: per.length, opened, replied, openRate: rate(opened, known), replyRate: rate(replied, per.length) };
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
// reach out (Dream List, Shortlisted) it has none. In Ready to reach out
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
    { name: "Shortlisted", color: "gray" },
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
