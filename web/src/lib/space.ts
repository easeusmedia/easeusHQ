// A department's own pages, Notion-style (prisma Space): sections hold
// portals, portals hold boards, a board is a database of leads moving
// through its stages, with properties every lead records. The rules here are
// pure, so the server enforces them and the client can preview them.

export type SpaceKind = "section" | "portal" | "board";

// What each level is called, and what it holds
export const CHILD_OF: Record<"department" | "section" | "portal", SpaceKind> = {
  department: "section",
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
export const STAGE_PILL = { dot: "bg-accent", pill: "bg-white/[0.04] text-foreground/90 border-white/[0.08]" };

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

export type ChannelKind = "email" | "instagram" | "linkedin" | "x" | "phone" | "other";
export const CHANNELS: { kind: ChannelKind; label: string }[] = [
  { kind: "email", label: "Email" },
  { kind: "instagram", label: "Instagram" },
  { kind: "linkedin", label: "LinkedIn" },
  { kind: "x", label: "X" },
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
  values: Record<string, unknown>;
  // its messages' variables, by name
  vars: Record<string, string>;
  stageSince: string;
  createdAt: string;
  // who last changed its details, and when
  editedByName: string | null;
  editedAt: string | null;
};
export type MessageData = { id: string; stageId: string; name: string; channel: string; subject: string; body: string };
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
// what each day of the sequence sends, in its name
const DAYS = ["Email 1 and LinkedIn note", "Instagram 1", "Email 2", "LinkedIn DM", "Instagram 2", "Email 3", "Instagram 3 and LinkedIn 3", "Final email"].map((what, i) => ({
  name: `Day ${i + 1} · ${what}`,
  color: "yellow" as ColorName,
}));
export const DREAM_156: BoardTemplate = {
  name: "Dream 156 Podcasts (Core Offer)",
  stages: [
    { name: "Dream 156 list", color: "default" },
    { name: "Shortlisted", color: "gray" },
    { name: "Write-up done", color: "brown" },
    { name: "Ready to reach out", color: "orange" },
    ...DAYS,
    { name: "Audit sent", color: "purple" },
    { name: "Replied", color: "green" },
    { name: "No reply after the audit", color: "brown" },
    { name: "Parked for later", color: "orange" },
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
