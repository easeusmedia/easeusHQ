// Sales > Leads (Abhishek, 3 Nov 2026): the leads the team finds, one
// spreadsheet per type (Podcast, Doctors). Each lead is an ordinary Lead on a
// board under the Leads portal (Space.leadBank), its people and links on that
// board's Contacts and Links properties.
import type { Prisma } from "@prisma/client";
import { handleOf, type ChannelKind, type Contact, type LinkValue } from "./space.ts";

// A Leads tab's two stages, never shown as stages: its leads, and the ones
// deleted (Dead leads, to restore or delete for good: Abhishek, 3 Nov 2026)
export const SHEET_STAGE = "Leads";
export const DEAD_STAGE = "Dead";

// A Leads tab's own make-up: its two stages and the two properties its
// spreadsheet fills, the people and the links
export async function makeSheet(tx: Prisma.TransactionClient, boardId: string) {
  await tx.boardStage.createMany({
    data: [
      { boardId, name: SHEET_STAGE, color: "gray", sortOrder: 1 },
      { boardId, name: DEAD_STAGE, color: "red", sortOrder: 2 },
    ],
  });
  await tx.boardField.createMany({
    data: [
      { boardId, name: "Contacts", kind: "contacts", sortOrder: 1 },
      { boardId, name: "Links", kind: "links", sortOrder: 2 },
    ],
  });
}

// a link with an @ in it (a map's "/@19.07,72.87") isn't an address
const EMAIL = /^[^@\s/]+@[\w.-]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s().-]{7,}$/;
const digits = (v: string) => v.replace(/\D/g, "").length;
const hostOf = (v: string) => /^(?:https?:\/\/)?(?:www\.|m\.)?([^/?#\s]+)/i.exec(v.trim())?.[1]?.toLowerCase() ?? "";
const isFacebook = (host: string) => /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host);

// What a pasted link, email or number is, so it lands in its own column:
// Instagram, LinkedIn, Facebook, a website… null when it's none of them.
// Facebook and websites are kept as "other" (the outreach boards' kind for
// any page), told apart by their address (columnOf).
export function channelOf(raw: string): { kind: ChannelKind; value: string } | null {
  // an area code's bracket stays: "(555) 123-4567"
  const v = raw.trim().replace(/^(?:<|\((?!\d+\)))+|[>),.;]+$/g, "");
  if (!v) return null;
  const mail = v.replace(/^mailto:/i, "");
  if (EMAIL.test(mail)) return { kind: "email", value: mail };
  const tel = v.replace(/^tel:/i, "");
  if (PHONE.test(tel) && digits(tel) >= 7 && digits(tel) <= 15) return { kind: "phone", value: tel };
  // a bare @handle: Instagram's, as most of the handles found are
  if (/^@[\w.]{2,30}$/.test(v)) return { kind: "instagram", value: v };
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let host: string;
  try {
    const u = new URL(url);
    // a real name with letters at the end ("98765" isn't an address)
    if (!/\.[a-z]{2,}$/i.test(u.hostname) || /\s/.test(v)) return null;
    host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
  if (/(^|\.)instagram\.com$/.test(host)) return { kind: "instagram", value: url };
  if (/(^|\.)linkedin\.com$/.test(host)) return { kind: "linkedin", value: url };
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return { kind: "x", value: url };
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return { kind: "youtube", value: url };
  return { kind: "other", value: url };
}

// Everything pasted at once, one per line, comma or space (a phone number
// keeps its spaces): what was understood, and what wasn't. A comma inside a
// link before a digit (a map's "@19.07,72.87") is part of it, and a number
// is only a phone standing alone, never digits inside a link or an address.
export function channelsIn(text: string): { found: { kind: ChannelKind; value: string }[]; left: string[] } {
  const pieces = text.split(/[\n;]+|,(?!\d)|(?<!\/\S*),/).flatMap((p) => {
    const phones: string[] = [];
    const rest = p.replace(/(?<![\w@/=.,?&#+-])\(?\+?\d[\d\s().-]{5,}\d(?![\w@/])/g, (m) => (digits(m) >= 7 && digits(m) <= 15 ? (phones.push(m), " ") : m));
    return [...phones, ...rest.split(/\s+/)].map((x) => x.trim()).filter(Boolean);
  });
  const found: { kind: ChannelKind; value: string }[] = [];
  const left: string[] = [];
  for (const p of pieces) {
    const c = channelOf(p);
    // a stray bracket or dash around what was taken isn't anything to fix
    if (!c) {
      if (/\w/.test(p)) left.push(p);
    } else if (!found.some((f) => f.kind === c.kind && f.value.toLowerCase() === c.value.toLowerCase())) found.push(c);
  }
  return { found, left };
}

// The spreadsheet's columns for a person's details, in order
export type SheetColumn = "email" | "phone" | "instagram" | "linkedin" | "facebook" | "website" | "x" | "youtube";
export const SHEET_COLUMNS: { key: SheetColumn; label: string; always: boolean }[] = [
  { key: "email", label: "Email", always: true },
  { key: "phone", label: "Phone", always: true },
  { key: "instagram", label: "Instagram", always: true },
  { key: "linkedin", label: "LinkedIn", always: true },
  { key: "facebook", label: "Facebook", always: true },
  { key: "website", label: "Website", always: true },
  // only when some lead on the tab has one
  { key: "x", label: "X", always: false },
  { key: "youtube", label: "YouTube", always: false },
];
// The columns in the order a tab's headings were dragged into (Abhishek,
// 10 Nov 2026). A column not in that order yet (X or YouTube, once a lead has
// one) goes after the one it follows by default; one gone stays out.
export function arrange(keys: string[], saved: string[]): string[] {
  const out = saved.filter((k) => keys.includes(k));
  keys.forEach((k, i) => {
    if (!out.includes(k)) out.splice(i ? out.indexOf(keys[i - 1]) + 1 : 0, 0, k);
  });
  return out;
}
export function columnOf(c: { kind: ChannelKind; value: string }): SheetColumn {
  if (c.kind !== "other") return c.kind;
  return isFacebook(hostOf(c.value)) ? "facebook" : "website";
}

// How a detail reads in its cell: the address or number as typed, a page by
// its handle ("@drmehta", "in/drmehta") or, failing that, its address
// without the https://www.
export function shownAs(c: { kind: ChannelKind; value: string }): string {
  const v = c.value.trim();
  if (c.kind === "email" || c.kind === "phone" || v.startsWith("@")) return v;
  if (columnOf(c) === "facebook") {
    // a page's name, not Facebook's own paths (share, groups, profile.php…)
    const page = /facebook\.com\/(?:people\/)?([\w.-]+)/i.exec(v)?.[1];
    if (page && !/^(share|groups|people|pages|events|watch|story\.php|permalink\.php|profile\.php)$/i.test(page)) return page;
  }
  const handle = handleOf(v);
  if (handle && handle !== hostOf(v)) return handle;
  return v.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

// One lead on a Leads tab, as the spreadsheet and its window show it
export type SheetLead = {
  id: string;
  title: string;
  contacts: Contact[];
  links: LinkValue[];
  notes: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  editedByName: string | null;
  editedAt: string | null;
  // in Dead leads
  dead: boolean;
};
export type SheetData = {
  id: string;
  name: string;
  slug: string;
  // the tab's own Contacts and Links properties, which its leads' window saves to
  contactsField: string | null;
  linksField: string | null;
  leads: SheetLead[];
};

// Where a lead can be moved: an outreach board in the department (any board
// not under Leads), with its portal
export type OutreachBoard = { id: string; name: string; portal: string };

// Everything a search can find on a row
export function sheetText(l: SheetLead): string {
  return [l.title, l.notes, ...l.contacts.flatMap((p) => [p.name, p.role, ...(p.channels ?? []).map((c) => c.value)]), ...l.links.map((x) => x.url)].join(" ").toLowerCase();
}

// The values a lead takes on the board it moves to (another outreach board,
// or a Leads tab): each property onto the one there with the same name and
// kind (a tag by the tag's name), its people and links onto the first of
// their kind when no name matches; anything the board has no place for goes
// onto the end of its notes, so nothing is lost.
type MoveField = { id: string; name: string; kind: string; options?: { id: string; name: string }[] };
const said = (kind: string, v: unknown): string => {
  if (kind === "contacts") return (v as Contact[]).map((p) => [p.name, p.role, ...(p.channels ?? []).map((c) => c.value)].filter(Boolean).join(", ")).join("; ");
  if (kind === "links") return (v as LinkValue[]).map((l) => (l.label ? `${l.label}: ${l.url}` : l.url)).join(", ");
  if (kind === "count") {
    const c = v as { n: number | null; remark: string };
    return [c.n, c.remark].filter((x) => x != null && x !== "").join(", ");
  }
  if (kind === "checkbox") return v ? "Yes" : "No";
  return String(v);
};
export function movedValues(from: { fields: MoveField[]; values: Record<string, unknown>; notes: string }, to: MoveField[]): { values: Record<string, unknown>; notes: string } {
  const values: Record<string, unknown> = {};
  const lost: string[] = [];
  const same = (f: MoveField) => to.find((t) => t.kind === f.kind && t.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  for (const f of from.fields) {
    const v = from.values[f.id];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (f.kind === "select" || f.kind === "multi") {
      const names = (v as string[]).flatMap((id) => f.options?.filter((o) => o.id === id).map((o) => o.name) ?? []);
      const t = same(f);
      const ids = t ? names.flatMap((n) => t.options?.filter((o) => o.name.toLowerCase() === n.toLowerCase()).map((o) => o.id) ?? []) : [];
      if (t && names.length && ids.length === names.length) values[t.id] = ids;
      else if (names.length) lost.push(`${f.name}: ${names.join(", ")}`);
      continue;
    }
    const t = same(f) ?? (f.kind === "contacts" || f.kind === "links" ? to.find((x) => x.kind === f.kind) : undefined);
    if (!t) lost.push(`${f.name}: ${said(f.kind, v)}`);
    // two of the lead's own (Contacts and Podcast contacts) onto one there: together
    else if (Array.isArray(v) && Array.isArray(values[t.id])) values[t.id] = [...(values[t.id] as unknown[]), ...v];
    else values[t.id] = v;
  }
  return { values, notes: lost.length ? `${from.notes}\n\n${lost.join("\n")}`.trim() : from.notes };
}
