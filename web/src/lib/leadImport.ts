// Importing leads from a file someone already has (a spreadsheet, an export,
// a sequence page, a PDF, a screenshot), read in the browser so the file
// itself never leaves it. Its columns are placed on the board's own
// properties by name and by what they hold; what comes out is what add_leads
// takes (lib/mcp/tools.ts), so an import is checked, deduped and recorded
// like leads added through a connection. Pure down to the readers at the
// end, which need a browser (DOMParser, canvas) and load pdfjs and fflate
// only when a file needs them.
import { variablesIn, type BoardData, type FieldData, type LeadData, type OptionData } from "./space.ts";
import type { PickOption } from "./pickList.ts";
import { resizeToJpegMaxDim } from "./imageResize.ts";

// ---- Which files ----

const KIND: Record<string, "csv" | "tsv" | "text" | "json" | "html" | "xlsx" | "docx" | "pdf" | "image"> = {
  csv: "csv",
  tsv: "tsv",
  txt: "text",
  md: "text",
  json: "json",
  html: "html",
  htm: "html",
  xlsx: "xlsx",
  docx: "docx",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
};
export const ACCEPT = Object.keys(KIND)
  .map((e) => `.${e}`)
  .join(",");
const MAX_MB = 20;
// what Claude is asked to read at most from one file, for the allowance's sake
const MAX_TEXT = 150_000;
const MAX_SCANS = 10;
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
// a file that can't be imported, in words for the person importing it
export class Unreadable extends Error {}

// Why a file can't be imported, if it can't
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  const ext = extOf(file.name);
  if (["xls", "numbers", "ods"].includes(ext)) return "Save it as .xlsx or CSV, then import that.";
  if (!KIND[ext] || /^(video|audio)\//.test(file.type)) return "Import a document or an image: CSV, Excel, HTML, PDF, text or a picture.";
  if (file.size > MAX_MB * 1024 * 1024) return `That file is over ${MAX_MB} MB. Import a smaller one.`;
  return null;
}

// ---- Rows ----

// A record as the file has it: flat (a spreadsheet row) or nested (JSON)
export type Row = Record<string, unknown>;
// Its values by path: "docs[].em[]" is every email of every doctor in it
export type Flat = Record<string, string[]>;
// a file is rows to place, or words and pictures for Claude to read
export type Read = { rows: Row[] } | { text: string; images: string[] };

export function flatten(v: unknown, path = "", out: Flat = {}): Flat {
  if (v == null) return out;
  if (Array.isArray(v)) for (const x of v) flatten(x, `${path}[]`, out);
  else if (typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out);
  else {
    const s = String(v).trim();
    if (s) (out[path] ??= []).push(s);
  }
  return out;
}

// The elements of the list at `list` ("docs[]") in a record
function elementsAt(v: unknown, list: string, path = ""): unknown[] {
  if (Array.isArray(v)) return `${path}[]` === list ? v : v.flatMap((x) => elementsAt(x, list, `${path}[]`));
  if (v && typeof v === "object")
    return Object.entries(v).flatMap(([k, x]) => {
      const p = path ? `${path}.${k}` : k;
      return list.startsWith(p) ? elementsAt(x, list, p) : [];
    });
  return [];
}
// the list a path is in, if any: "docs[].em[]" is in "docs[]"
const listOf = (path: string) => (path.includes("[]") ? path.slice(0, path.indexOf("[]") + 2) : "");

// RFC 4180: a quoted field can hold the delimiter, quotes ("") and line
// breaks. The delimiter is a tab for TSV, else whichever of , ; or tab the
// first line has most of.
export function parseCsv(text: string, delimiter?: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const first = s.split(/\r?\n/, 1)[0];
  const d = delimiter ?? [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (s[i + 1] === '"') field += s[i++];
      else quoted = false;
    } else if (c === '"' && !field) quoted = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

// A grid's rows by its first row's headings (a blank heading is "Column 3",
// a repeated one "Email 2"); empty lines are skipped
export function tableRows(grid: string[][]): Row[] {
  const [head, ...body] = grid.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const seen = new Map<string, number>();
  const keys = head.map((h, i) => {
    const k = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${k} ${n}` : k;
  });
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// The records in parsed JSON: its longest list of objects, wherever it is
export function jsonRows(v: unknown): Row[] {
  let best: Row[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) {
      const objects = x.filter((e): e is Row => !!e && typeof e === "object" && !Array.isArray(e));
      if (objects.length > best.length) best = objects;
      x.forEach(walk);
    } else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(v);
  return best;
}

// The records in a page's JSON blocks (<script type="application/json">, as
// the Dream 300 sequence pages carry them, or ld+json), read without a DOM
const JSON_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']?application\/(?:ld\+)?json\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
export function htmlScriptRows(html: string): Row[] {
  let best: Row[] = [];
  for (const m of html.matchAll(JSON_SCRIPT)) {
    try {
      const rows = jsonRows(JSON.parse(m[1]));
      if (rows.length > best.length) best = rows;
    } catch {}
  }
  return best;
}

// ---- Where each column goes ----

// The lead's name ("title"), its person ("contact.email"), its links
// ("link"), a property ("field:<id>"), a variable ("var:<name>"), a message
// written for it ("message:<id>:subject" or ":body"), or nowhere ("ignore")
export type Target = string;
export const CONTACT = [
  ["name", "Name"],
  ["role", "Role"],
  ["email", "Email"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
  ["phone", "Phone"],
  ["x", "X"],
  ["website", "Website"],
] as const;
type ContactKey = (typeof CONTACT)[number][0];

// a column: its path and up to 30 of its different values
export type Column = { path: string; values: string[] };
export function columnsOf(rows: Row[]): Column[] {
  const by = new Map<string, Set<string>>();
  for (const r of rows)
    for (const [p, vs] of Object.entries(flatten(r))) {
      const set = by.get(p) ?? new Set<string>();
      by.set(p, set);
      for (const v of vs) if (set.size < 30) set.add(v);
    }
  return [...by].map(([path, set]) => ({ path, values: [...set] }));
}

type Board = Pick<BoardData, "fields" | "messages">;
// The {{Variables}} the board's messages fill in
export const boardVars = (board: Pick<BoardData, "messages">) => variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
const placed = (f: Pick<FieldData, "kind">) => f.kind !== "contacts" && f.kind !== "links";

// Everywhere a column can go, as the Dropdown lists them
export function targetsOf(board: Board): PickOption[] {
  return [
    { value: "ignore", label: "Leave out" },
    { value: "title", label: "Lead name", group: "Lead" },
    { value: "link", label: "Link", group: "Lead" },
    ...CONTACT.map(([k, label]) => ({ value: `contact.${k}`, label, group: "Contact" })),
    ...board.fields.filter(placed).map((f) => ({ value: `field:${f.id}`, label: f.name, group: "Properties" })),
    ...boardVars(board).map((v) => ({ value: `var:${v}`, label: v, group: "Variables" })),
    ...board.messages.flatMap((m) => [
      ...(m.channel === "email" ? [{ value: `message:${m.id}:subject`, label: `${m.name} subject`, group: "Messages" }] : []),
      { value: `message:${m.id}:body`, label: m.name, group: "Messages" },
    ]),
  ];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// a column's own name, the last step of its path ("docs[].em[]" is "em")
const nameOf = (path: string) => path.split(".").pop()!.replace(/\[\]/g, "");

// Headings people use, read without case, spaces or punctuation
const SAID: Record<string, Target> = {
  ...Object.fromEntries(
    ["title", "lead", "leadname", "company", "companyname", "business", "brand", "clinic", "practice", "podcast", "podcastname", "show", "showname", "channelname", "organisation", "organization"].map((h) => [h, "title"]),
  ),
  ...Object.fromEntries(["name", "fullname", "contact", "contactname", "person", "firstname", "lastname", "surname", "host", "hostname", "doctor"].map((h) => [h, "contact.name"])),
  ...Object.fromEntries(["role", "position", "jobtitle", "designation"].map((h) => [h, "contact.role"])),
  ...Object.fromEntries(["email", "emails", "emailaddress", "mail"].map((h) => [h, "contact.email"])),
  ...Object.fromEntries(["instagram", "ig", "insta"].map((h) => [h, "contact.instagram"])),
  ...Object.fromEntries(["linkedin", "li"].map((h) => [h, "contact.linkedin"])),
  ...Object.fromEntries(["youtube", "yt"].map((h) => [h, "contact.youtube"])),
  ...Object.fromEntries(["phone", "phonenumber", "mobile", "whatsapp", "tel", "telephone", "cell"].map((h) => [h, "contact.phone"])),
  ...Object.fromEntries(["x", "twitter"].map((h) => [h, "contact.x"])),
  ...Object.fromEntries(["website", "site", "web"].map((h) => [h, "contact.website"])),
  ...Object.fromEntries(["url", "link", "links"].map((h) => [h, "link"])),
};
// ...and headings that only mention one ("Podcast Instagram"); LinkedIn before link
const MENTIONS: [string, Target][] = [
  ["linkedin", "contact.linkedin"],
  ["instagram", "contact.instagram"],
  ["youtube", "contact.youtube"],
  ["twitter", "contact.x"],
  ["email", "contact.email"],
  ["phone", "contact.phone"],
  ["mobile", "contact.phone"],
  ["whatsapp", "contact.phone"],
  ["website", "contact.website"],
  ["url", "link"],
  ["link", "link"],
];
// one address or several in a cell ("a@x.com; b@x.com")
const emails = (v: string) => v.split(/[\s,;]+/).filter(Boolean);
const isEmail = (v: string) => emails(v).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

// A value as one of a field's tags: by its name, or by the start of it
// ("D1" is "D1 · Old hit still on top")
export function matchOption<O extends Pick<OptionData, "name">>(options: O[], value: string): O | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return options.find((o) => o.name.trim().toLowerCase() === v) ?? options.find((o) => o.name.trim().toLowerCase().startsWith(`${v} `));
}
// a multi field's comma list, unless the whole of it is one tag
const tagsIn = (f: Pick<FieldData, "kind" | "options">, v: string) =>
  (f.kind === "multi" && !matchOption(f.options, v) ? v.split(",") : [v]).map((t) => t.trim()).filter(Boolean);

// Whether a column's values can be what the heading says: a handle or a
// link has no spaces (so a LinkedIn note under "li" isn't taken for a page),
// a name is one line
function fits(t: Target, values: string[]): boolean {
  if (t === "contact.email") return values.every(isEmail);
  if (t === "contact.phone") return values.every((v) => /^[+\d\s().-]{5,}$/.test(v));
  if (t === "title" || t === "contact.name" || t === "contact.role") return values.every((v) => v.length <= 200 && !v.includes("\n"));
  if (t === "link" || t.startsWith("contact.")) return values.every((v) => !/\s/.test(v));
  return true;
}
// only one column can be the lead's name, a tag field, a variable or a message
const single = (t: Target, board: Board) =>
  t === "title" || t.startsWith("var:") || t.startsWith("message:") || (t.startsWith("field:") && board.fields.find((f) => `field:${f.id}` === t)?.kind !== "multi");

// What code can tell on its own: a heading that names a property, a
// variable ({{Name}} or its name), a message or a common heading, else
// values that are plainly emails, profiles, links or the field's own tags.
// A column it can't place is left out of the result.
export function autoMap(columns: Column[], board: Board): Record<string, Target> {
  const vars = boardVars(board);
  const out: Record<string, Target> = {};
  const taken = new Set<Target>();
  for (const { path, values } of columns) {
    const name = nameOf(path);
    const h = norm(name);
    const braced = /^\{\{(.+)\}\}$/.exec(name.trim())?.[1].trim();
    const field = board.fields.find((f) => placed(f) && norm(f.name) === h);
    const message = board.messages.find((m) => [m.name, `${m.name} body`, `${m.name} text`, `${m.name} subject`].some((n) => norm(n) === h));
    const named = vars.find((v) => norm(v) === h);
    const options = board.fields.find(
      (f) => (f.kind === "select" || f.kind === "multi") && f.options.length && values.every((v) => tagsIn(f, v).every((t) => matchOption(f.options, t))),
    );
    const t = [
      braced && vars.includes(braced) ? `var:${braced}` : undefined,
      field && `field:${field.id}`,
      SAID[h],
      message && `message:${message.id}:${h === norm(`${message.name} subject`) ? "subject" : "body"}`,
      named && `var:${named}`,
      MENTIONS.find(([w]) => h.includes(w))?.[1],
      values.every(isEmail) ? "contact.email" : undefined,
      values.every((v) => /linkedin\.com\//i.test(v)) ? "contact.linkedin" : undefined,
      values.every((v) => /instagram\.com\//i.test(v)) ? "contact.instagram" : undefined,
      values.every((v) => /^https?:\/\/\S+$/i.test(v)) ? "link" : undefined,
      options && `field:${options.id}`,
    ].find((x): x is Target => !!x && !taken.has(x) && fits(x, values));
    if (!t) continue;
    out[path] = t;
    if (single(t, board)) taken.add(t);
  }
  return out;
}

// ---- The leads, as add_leads takes them ----

export type ContactIn = { name?: string; role?: string } & Partial<Record<Exclude<ContactKey, "name" | "role">, string[]>>;
export type DraftIn = { subject: string; body: string };
export type LeadIn = {
  title: string;
  // by field id; tags by option id
  values?: Record<string, unknown>;
  contacts?: ContactIn[];
  links?: { label: string; url: string }[];
  vars?: Record<string, string>;
  // the main opener first, then one per element of a list of them ("alt[]")
  openers?: { label: string; drafts: Record<string, DraftIn> }[];
};
export type Preview = {
  leads: LeadIn[];
  // already on the board, or twice in the file
  existing: number;
  // without a name, or a property the board requires
  unnamed: number;
  missing: number;
  // values that aren't one of their field's tags, as "Country: India"
  unmatched: string[];
};

// A property's value from the column's words, as add_leads stores it, or null
function valueOf(f: FieldData, vs: string[], unmatched: Set<string>): unknown {
  switch (f.kind) {
    case "select":
    case "multi": {
      const ids = vs
        .flatMap((v) => tagsIn(f, v))
        .flatMap((t) => {
          const o = matchOption(f.options, t);
          if (!o) unmatched.add(`${f.name}: ${t}`);
          return o ? [o.id] : [];
        });
      const unique = [...new Set(ids)];
      return unique.length ? unique.slice(0, f.kind === "select" ? 1 : undefined) : null;
    }
    case "count": {
      const n = Number(vs[0].replace(/[,\s]/g, ""));
      return Number.isInteger(n) && n >= 0 && n <= 9999 ? { n, remark: "" } : { n: null, remark: vs[0] };
    }
    case "checkbox":
      return /^(yes|y|true|1|x|done|✓)$/i.test(vs[0]) ? true : null;
    case "date": {
      const iso = /^\d{4}-\d{2}-\d{2}/.exec(vs[0])?.[0];
      if (iso) return iso;
      // ponytail: other dates as the browser reads them (US order); a spreadsheet's day numbers aren't read
      const d = new Date(vs[0]);
      return Number.isNaN(d.getTime()) || d.getFullYear() > 9999 ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    case "text":
      return vs.join(", ").slice(0, 5000);
    default:
      return null;
  }
}

// Every row as a lead, in add_leads' limits (lib/mcp/tools.ts leadIn), and
// what the preview counts: the ones already on the board (by name, as
// add_leads dedupes), those missing what the board requires, tags not found
export function buildLeads(rows: Row[], mapping: Record<string, Target>, board: Pick<BoardData, "fields"> & { leads: Pick<LeadData, "title">[] }): Preview {
  const paths = Object.keys(mapping).filter((p) => mapping[p] !== "ignore");
  const to = (prefix: string) => paths.filter((p) => mapping[p].startsWith(prefix));
  const contactPaths = to("contact.");
  const messagePaths = to("message:");
  // a list of people (docs[]) makes one person each; a list of openers (alt[]) a backup each
  const people = contactPaths.map(listOf).find(Boolean) ?? "";
  const backups = messagePaths.map(listOf).find(Boolean) ?? "";
  const valuesFor = (flat: Flat, t: Target) => paths.filter((p) => mapping[p] === t).flatMap((p) => flat[p] ?? []);
  const varNames = [...new Set(to("var:").map((p) => mapping[p].slice(4)))];

  const contactOf = (flat: Flat): ContactIn | null => {
    const c: ContactIn = {};
    for (const p of contactPaths) {
      const vs = flat[p];
      if (!vs?.length) continue;
      const k = mapping[p].slice(8) as ContactKey;
      if (k === "name") c.name = [c.name, ...vs].filter(Boolean).join(" ").slice(0, 120);
      else if (k === "role") c.role = [c.role, ...vs].filter(Boolean).join(", ").slice(0, 60);
      else {
        const list = k === "email" ? vs.flatMap(emails) : vs;
        c[k] = [...new Set([...(c[k] ?? []), ...list.filter(Boolean).map((v) => v.slice(0, k === "phone" ? 60 : 300))])].slice(0, 20);
      }
    }
    return Object.keys(c).length ? c : null;
  };
  const draftsOf = (flat: Flat, among: string[]) => {
    const out: Record<string, DraftIn> = {};
    for (const p of among) {
      const v = flat[p]?.join("\n\n");
      if (!v) continue;
      const [, id, part] = mapping[p].split(":");
      const d = (out[id] ??= { subject: "", body: "" });
      if (part === "subject") d.subject ||= v.slice(0, 300);
      else d.body ||= v.slice(0, 20_000);
    }
    return Object.fromEntries(Object.entries(out).filter(([, d]) => d.body));
  };

  const seen = new Set(board.leads.map((l) => l.title.trim().toLowerCase()));
  const unmatched = new Set<string>();
  const out: Preview = { leads: [], existing: 0, unnamed: 0, missing: 0, unmatched: [] };
  for (const row of rows) {
    const flat = flatten(row);

    // people: one per element of their list, the row's other columns on the first
    let groups: Flat[] = [flat];
    if (people) {
      const rest = Object.fromEntries(contactPaths.filter((p) => !p.startsWith(people) && flat[p]).map((p) => [p, flat[p]]));
      groups = elementsAt(row, people).map((e) => flatten(e, people));
      groups[0] = { ...groups[0], ...rest };
    }
    const contacts = groups.map(contactOf).filter((c): c is ContactIn => !!c).slice(0, 50);

    const named = paths.filter((p) => mapping[p] === "title").map((p) => flat[p]).find((v) => v?.length) ?? contacts.flatMap((c) => c.name ?? []);
    const title = named.join(" / ").trim().replace(/\s+/g, " ").slice(0, 200);
    if (!title) {
      out.unnamed++;
      continue;
    }
    if (seen.has(title.toLowerCase())) {
      out.existing++;
      continue;
    }

    const values: Record<string, unknown> = {};
    for (const f of board.fields.filter(placed)) {
      const vs = valuesFor(flat, `field:${f.id}`);
      const v = vs.length ? valueOf(f, vs, unmatched) : null;
      if (v != null) values[f.id] = v;
    }
    const links = [...new Set(valuesFor(flat, "link"))].slice(0, 50).map((url) => ({ label: "", url: url.slice(0, 500) }));
    const vars = Object.fromEntries(varNames.map((n) => [n.slice(0, 60), valuesFor(flat, `var:${n}`).join(", ").slice(0, 2000)]).filter(([, v]) => v));
    // the sequence's other messages go with every opener (as doctors-setup did)
    const main = draftsOf(flat, backups ? messagePaths.filter((p) => !p.startsWith(backups)) : messagePaths);
    const openers = [main, ...(backups ? elementsAt(row, backups).map((e) => ({ ...main, ...draftsOf(flatten(e, backups), messagePaths) })) : [])]
      .filter((d) => Object.keys(d).length)
      .slice(0, 10)
      .map((drafts) => ({ label: "", drafts }));

    if (board.fields.some((f) => f.required && (f.kind === "contacts" ? !contacts.length : f.kind === "links" ? !links.length : values[f.id] == null))) {
      out.missing++;
      continue;
    }
    seen.add(title.toLowerCase());
    out.leads.push({
      title,
      ...(Object.keys(values).length ? { values } : {}),
      ...(contacts.length ? { contacts } : {}),
      ...(links.length ? { links } : {}),
      ...(Object.keys(vars).length ? { vars } : {}),
      ...(openers.length ? { openers } : {}),
    });
  }
  out.unmatched = [...unmatched];
  return out;
}

// ---- Claude's part: words and pictures, in pieces ----

export type Part = { text?: string; images?: string[] };
// About 12,000 characters, or five pictures (under 3 MB together, well
// inside a server action's 4.5 MB), per call
export function partsOf({ text, images }: { text: string; images: string[] }): Part[] {
  const parts: Part[] = [];
  let chunk = "";
  for (const line of text.split("\n")) {
    if (chunk.length + line.length > 12_000) {
      if (chunk.trim()) parts.push({ text: chunk });
      chunk = "";
    }
    chunk += `${line.slice(0, 12_000)}\n`;
  }
  if (chunk.trim()) parts.push({ text: chunk });
  let group: string[] = [];
  for (const img of images) {
    if (group.length === 5 || group.reduce((n, g) => n + g.length, 0) + img.length > 3_000_000) {
      parts.push({ images: group });
      group = [];
    }
    group.push(img);
  }
  if (group.length) parts.push({ images: group });
  return parts;
}
// A part cut in two, when Claude's answer to it ran out of room
export function halves(part: Part): [Part, Part] | null {
  if (part.images && part.images.length > 1) {
    const mid = Math.ceil(part.images.length / 2);
    return [{ images: part.images.slice(0, mid) }, { images: part.images.slice(mid) }];
  }
  const text = part.text ?? "";
  const mid = text.indexOf("\n", text.length / 2);
  return mid > 0 && mid < text.length - 1 ? [{ text: text.slice(0, mid) }, { text: text.slice(mid + 1) }] : null;
}

// ---- Reading a file (browser only) ----

const xmlOf = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const all = (n: Document | Element, tag: string) => [...n.getElementsByTagNameNS("*", tag)];

// The first sheet of a workbook, as rows. Its zip's XML: the shared strings,
// the workbook's sheet order and where each sheet is kept.
function xlsxRows(files: Record<string, string>): Row[] {
  const shared = files["xl/sharedStrings.xml"] ? all(xmlOf(files["xl/sharedStrings.xml"]), "si").map((si) => all(si, "t").map((t) => t.textContent ?? "").join("")) : [];
  const id = files["xl/workbook.xml"] && all(xmlOf(files["xl/workbook.xml"]), "sheet")[0]?.getAttribute("r:id");
  const target = id && files["xl/_rels/workbook.xml.rels"] && all(xmlOf(files["xl/_rels/workbook.xml.rels"]), "Relationship").find((r) => r.getAttribute("Id") === id)?.getAttribute("Target");
  const sheet = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  if (!files[sheet]) return [];
  const grid = all(xmlOf(files[sheet]), "row").map((row) => {
    const cells: string[] = [];
    for (const c of all(row, "c")) {
      const letters = /^[A-Z]+/.exec(c.getAttribute("r") ?? "")?.[0];
      const col = letters ? [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length;
      const v = all(c, "v")[0]?.textContent ?? "";
      const type = c.getAttribute("t");
      cells[col] = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? all(c, "t").map((t) => t.textContent ?? "").join("") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
    }
    return Array.from(cells, (x) => x ?? "");
  });
  return tableRows(grid);
}

// A page's JSON blocks, else its first table, else its words.
// ponytail: a cell's words only, not where its link points; read hrefs if a column of "Visit" links turns up
function readHtml(html: string): Read {
  const rows = htmlScriptRows(html);
  if (rows.length) return { rows };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  const cells = tableRows(table ? [...table.rows].map((tr) => [...tr.cells].map((td) => td.textContent?.replace(/\s+/g, " ").trim() ?? "")) : []);
  if (cells.length) return { rows: cells };
  doc.querySelectorAll("script, style, noscript").forEach((e) => e.remove());
  return { text: doc.body?.textContent?.replace(/\n\s*\n+/g, "\n").trim() ?? "", images: [] };
}

// A PDF's words, page by page; a page with next to none is a scan, sent as a picture
async function readPdf(file: File): Promise<Read> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = "";
  const images: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const words = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("");
    if (words.trim().length >= 100) {
      text += `${words}\n`;
      continue;
    }
    if (images.length === MAX_SCANS) throw new Unreadable(`That PDF has more than ${MAX_SCANS} scanned pages. Split it into smaller files.`);
    const fit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1568 / Math.max(fit.width, fit.height) });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return { text, images };
}

export async function readFile(file: File): Promise<Read> {
  const kind = KIND[extOf(file.name)];
  let read: Read;
  if (kind === "image") read = { text: "", images: [await resizeToJpegMaxDim(file, 1568)] };
  else if (kind === "pdf") read = await readPdf(file);
  else if (kind === "xlsx" || kind === "docx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => /^(xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)|word\/document\.xml)$/.test(f.name),
    });
    const files = Object.fromEntries(Object.entries(zip).map(([n, b]) => [n, strFromU8(b)]));
    if (kind === "xlsx") read = { rows: xlsxRows(files) };
    else {
      const doc = files["word/document.xml"] ? xmlOf(files["word/document.xml"]) : null;
      read = { text: doc ? all(doc, "p").map((p) => all(p, "t").map((t) => t.textContent ?? "").join("")).join("\n") : "", images: [] };
    }
  } else {
    const text = await file.text();
    if (kind === "csv" || kind === "tsv") read = { rows: tableRows(parseCsv(text, kind === "tsv" ? "\t" : undefined)) };
    else if (kind === "html") read = readHtml(text);
    else if (kind === "json") {
      let rows: Row[] = [];
      try {
        rows = jsonRows(JSON.parse(text));
      } catch {}
      read = rows.length ? { rows } : { text, images: [] };
    } else read = { text, images: [] };
  }
  if ("rows" in read ? !read.rows.length : !read.text.trim() && !read.images.length) throw new Unreadable("There are no leads in that file to import.");
  if ("text" in read && read.text.length > MAX_TEXT) throw new Unreadable("That's too much text to read in one go. Split it into smaller files.");
  return read;
}
