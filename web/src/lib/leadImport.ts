// Importing leads from a file someone already has (a spreadsheet, an export,
// a sequence page, a PDF, a screenshot), read in the browser so the file
// itself never leaves it. Its columns are placed on the board's own
// properties by name and by what they hold; what comes out is what add_leads
// takes (lib/mcp/tools.ts), so an import is checked, deduped and recorded
// like leads added through a connection. Pure down to the readers at the
// end, which need a browser (DOMParser, canvas) and load pdfjs and fflate
// only when a file needs them.
import { fillText, firstName, handleOf, variablesIn, type BoardData, type FieldData, type LeadData, type OptionData } from "./space.ts";
import type { PickOption } from "./pickList.ts";

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
  // whichever of these the browser can open (Safari opens an iPhone's HEIC); all leave as JPEG
  heic: "image",
  heif: "image",
  tif: "image",
  tiff: "image",
  avif: "image",
  bmp: "image",
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

// a cell that only says there's nothing there ("N/A", "-", "#N/A"), kept out
// of everything; not "x", a ticked checkbox
const EMPTY = /^(n\/?a|none|null|nil|undefined|-+|—|–|#n\/a|#value!|#ref!|#name\?|tbd|unknown|\?+)$/i;
export function flatten(v: unknown, path = "", out: Flat = {}): Flat {
  if (v == null) return out;
  if (Array.isArray(v)) for (const x of v) flatten(x, `${path}[]`, out);
  else if (typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out);
  else {
    const s = String(v).trim();
    if (s && !EMPTY.test(s)) (out[path] ??= []).push(s);
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
// the record a path is in: "m.email" is in "m", "title" in the row itself
const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf(".")));

// RFC 4180: a quoted field can hold the delimiter, quotes ("") and line
// breaks. The delimiter is a tab for TSV, else the one Excel's "sep=" line
// names, else whichever of , ; or tab the first lines have most of (not just
// the first: a title line above the headings has none).
export function parseCsv(text: string, delimiter?: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const first = s.split(/\r?\n/, 5).join("\n");
  const d = delimiter ?? /^sep=(.)/.exec(first)?.[1] ?? [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
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
    } else if (c === '"' && !field.trim()) {
      // a space typed before the quote (`a, "Doe, Jane"`) still opens it
      quoted = true;
      field = "";
    } else if (c === d) {
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

// A Notion export's link to the page a cell names ("Glow Clinic (https://www.notion.so/…)")
const NOTION_LINK = /\s*\((https?:\/\/(?:www\.|app\.)?notion\.(?:so|site|com)\/[^)\s]*)\)/g;
const reaches = (c: string) => /@|https?:\/\/|www\./i.test(c);

// A grid's rows by its headings (a blank heading is "Column 3", a repeated one
// "Email 2"). The headings are the first row mostly filled with words, so a
// title line, Excel's "sep=" or LinkedIn's notes above them are passed over;
// a file whose first row is already a lead (an address in it) has none.
// Empty lines, the headings again (exports pasted together) and a totals row
// are skipped; a Notion page named in a cell becomes that column's link.
export function tableRows(grid: string[][]): Row[] {
  const rows = grid.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  const filled = (r: string[]) => r.filter(Boolean).length;
  const widest = Math.max(0, ...rows.slice(0, 20).map(filled));
  // (a merged banner fills its row with one title, so the headings say two things at least)
  const at = rows.slice(0, 10).findIndex((r) => filled(r) >= Math.max(2, Math.ceil(widest / 2)) && new Set(r.filter(Boolean)).size > 1 && !r.some(reaches));
  if (!rows.length) return [];
  const headless = at < 0 && rows[0].some((c) => reaches(c) || /^@\w/.test(c));
  // (a heading is one line, whatever breaks its cell has)
  const first = headless ? [] : rows[Math.max(0, at)].map((h) => h.replace(/\s+/g, " "));
  const same = (r: string[]) => first.length > 0 && first.every((h, i) => h.toLowerCase() === (r[i] ?? "").toLowerCase());
  const totals = (r: string[]) => /^(sub)?totals?:?$/i.test(r.find(Boolean) ?? "") && r.filter(Boolean).slice(1).every((c) => /^[\d.,\s%$€£-]+$/.test(c));
  const body = rows.slice(headless ? 0 : Math.max(0, at) + 1).filter((r) => !same(r) && !totals(r));
  // a row longer than the headings (an unquoted comma) keeps its last cells, as "Column 4"
  const width = Math.max(first.length, ...body.map((r) => r.findLastIndex(Boolean) + 1));
  const used = new Set<string>();
  const keys = Array.from({ length: width }, (_, i) => {
    const k = first[i] || `Column ${i + 1}`;
    let n = 1;
    while (used.has(n > 1 ? `${k} ${n}` : k)) n++;
    used.add(n > 1 ? `${k} ${n}` : k);
    return n > 1 ? `${k} ${n}` : k;
  });
  return body.map((r) => {
    const row: Row = {};
    keys.forEach((k, i) => {
      const c = r[i] ?? "";
      const pages = [...c.matchAll(NOTION_LINK)].map((m) => m[1]);
      row[k] = pages.length ? c.replace(NOTION_LINK, "") : c;
      if (pages.length) row[`${k} link`] = pages;
    });
    return row;
  });
}

// The records in parsed JSON: its longest list of objects, wherever it is,
// but never one inside another's records (a lead's own people or episodes).
// Records kept by id ({"-Nx1": {...}, "-Nx2": {...}}) are a list too, and a
// grid of cells (Google Sheets' "values") is rows under its first row.
export function jsonRows(v: unknown): Row[] {
  let best: Row[] = [];
  const isObject = (e: unknown): e is Row => !!e && typeof e === "object" && !Array.isArray(e);
  const walk = (x: unknown) => {
    if (Array.isArray(x)) {
      const grid = x.length > 1 && x.every((r) => Array.isArray(r) && r.every((c) => c == null || typeof c !== "object"));
      const objects = grid ? tableRows((x as unknown[][]).map((r) => r.map((c) => (c == null ? "" : String(c))))) : x.filter(isObject);
      if (objects.length > best.length) best = objects;
      if (!objects.length) x.forEach(walk);
    } else if (isObject(x)) {
      const values = Object.values(x);
      const keys = isObject(values[0]) ? Object.keys(values[0]) : [];
      // laid out alike (over half the first one's keys), not one record's
      // parts ({company: {...}, contact: {...}}) nor columns by row number (pandas' {"email": {"0": ...}})
      const byId = values.length > 1 && !keys.every((k) => /^\d+$/.test(k)) && values.every((e) => isObject(e) && Object.keys(e).filter((k) => keys.includes(k)).length > keys.length / 2);
      if (byId && values.length > best.length) best = values as Row[];
      if (!byId) values.forEach(walk);
    }
  };
  walk(v);
  return best;
}

// The records in a page's JSON blocks (<script type="application/json">, as
// the Dream 300 sequence pages carry them), read without a DOM. Not ld+json:
// that's the page's own details for search engines, never its leads.
const JSON_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']?(?:application|text)\/json\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
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
// ("link"), its write-up ("notes"), a property ("field:<id>"), a variable ("var:<name>"), a message
// written for it ("message:<id>:subject" or ":body"), or nowhere ("ignore").
// A message's target can name the version of it the column writes, when the
// file words a message two ways for each lead ("message:<id>:body:Community"),
// and a column that writes several messages (the board's same words on
// Instagram and LinkedIn) has each one's target, joined by "|".
export type Target = string;
export const targetsIn = (t: Target): Target[] => (t.startsWith("message:") ? t.split("|") : [t]);
const versionOf = (t: Target) => t.split(":")[3] ?? "";
// Whether a target is one of the board's (its versions aside), as the dialog checks Claude's
export function placeable(board: Board) {
  const offered = new Set(targetsOf(board).map((t) => t.value));
  return (t: Target | undefined) => !!t && targetsIn(t).every((x) => offered.has(x.startsWith("message:") ? x.split(":").slice(0, 3).join(":") : x));
}
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

// Everywhere a column can go, as the Dropdown lists them: people and links
// only on a board with a property to keep them in
export function targetsOf(board: Board): PickOption[] {
  const has = (kind: string) => board.fields.some((f) => f.kind === kind);
  return [
    { value: "ignore", label: "Leave out" },
    { value: "title", label: "Lead name", group: "Lead" },
    ...(has("links") ? [{ value: "link", label: "Link", group: "Lead" }] : []),
    // what the file says about the lead that no property takes (its research notes), kept on the lead
    { value: "notes", label: "Notes", group: "Lead" },
    ...(has("contacts") ? CONTACT.map(([k, label]) => ({ value: `contact.${k}`, label, group: "Contact" })) : []),
    ...board.fields.filter(placed).map((f) => ({ value: `field:${f.id}`, label: f.name, group: "Properties" })),
    ...boardVars(board).map((v) => ({ value: `var:${v}`, label: v, group: "Variables" })),
    ...board.messages.flatMap((m) => [
      ...(m.channel === "email" ? [{ value: `message:${m.id}:subject`, label: `${m.name} subject`, group: "Messages" }] : []),
      { value: `message:${m.id}:body`, label: m.name, group: "Messages" },
    ]),
  ];
}

// a heading without case, accents, spaces or punctuation ("País" is "pais")
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
// a column's own name, the last step of its path ("docs[].em[]" is "em"); a
// name one step inside a record is that record's ("company.name" is the
// company's), one in a list each element's ("docs[].name" each doctor's)
const nameOf = (path: string) => {
  const steps = path.split(".");
  const last = steps.pop()!.replace(/\[\]/g, "");
  const parent = steps.pop();
  return parent && !parent.endsWith("[]") && /^(name|title|label|value|content|text)$/i.test(last) ? `${parent} ${last}` : last;
};
// a wide sheet's columns per person: "Contact 2 Email" is the second person's email
const PERSON_N = /^\s*(?:contact|person|owner|doctor|assistant)\s*(\d+)\b\s*/i;
const personOf = (path: string) => PERSON_N.exec(nameOf(path))?.[1] ?? "";
const bareName = (path: string) => nameOf(path).replace(PERSON_N, "").trim();

// Headings people use, read without case, spaces or punctuation
const heads = (t: Target, hs: string[]) => Object.fromEntries(hs.map((h) => [h, t]));
// the parts of a person's name, joined into one ("Jane" + "Doe")
const NAME_PARTS = [
  /^(first|firstname|givenname|forename|vorname|fname|nombre)$/,
  /^(middle|middlename)$/,
  /^(last|lastname|surname|familyname|nachname|lname|apellidos?)$/,
];
const SAID: Record<string, Target> = {
  ...heads("title", ["title", "lead", "leadname", "company", "companyname", "business", "brand", "clinic", "clinica", "praxis", "practice", "podcast", "podcastname", "show", "showname", "channelname", "organisation", "organization", "account"]),
  ...heads("contact.name", ["name", "fullname", "full", "contact", "contactname", "person", "host", "hostname", "doctor", "first", "firstname", "givenname", "forename", "vorname", "fname", "nombre", "middle", "middlename", "last", "lastname", "surname", "familyname", "nachname", "lname", "apellido", "apellidos"]),
  ...heads("contact.role", ["role", "position", "jobtitle", "designation", "cargo", "puesto"]),
  ...heads("contact.email", ["email", "emails", "emailaddress", "mail", "correo", "correoelectronico", "emailadresse"]),
  ...heads("contact.instagram", ["instagram", "ig", "insta"]),
  ...heads("contact.linkedin", ["linkedin", "li"]),
  ...heads("contact.youtube", ["youtube", "yt"]),
  ...heads("contact.phone", ["phone", "phonenumber", "phoneno", "contactnumber", "mobile", "whatsapp", "tel", "telephone", "cell", "telefono", "telefon", "handy", "celular", "movil"]),
  ...heads("contact.x", ["x", "twitter"]),
  ...heads("contact.website", ["website", "site", "web", "webseite", "sitioweb"]),
  ...heads("link", ["url", "link", "links"]),
  ...heads("notes", ["notes", "note", "remarks", "comments"]),
};
// a heading by its words, else without a last "name" or "handle" ("Clinic name", "IG handle"), else its last step's
const said = (path: string): Target | undefined => {
  const h = norm(bareName(path));
  return h ? (SAID[h] ?? SAID[h.replace(/(name|handle)$/, "")] ?? SAID[norm(path.split(".").pop()!.replace(/\[\]/g, ""))]) : undefined;
};
// headings for a property named another way
const FIELD_SAID: Record<string, string> = { countryregion: "country", pais: "country", land: "country", nation: "country" };
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
// The addresses in a cell, however they're written ("Jane Doe
// <jane@glow.com>", "mailto:", "a@x.com / b@x.com", "raj [at] facemd [dot]
// com"), in lower case
const ADDRESS = /[^\s<>()[\]"',;:/]+@[^\s<>()[\]"',;:/]+\.[a-z]{2,}/gi;
const spelled = (v: string) => v.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
const emails = (v: string) => (spelled(v).match(ADDRESS) ?? []).map((e) => e.toLowerCase());
// a cell that is an address, a name or a word beside it at most, not a sentence mentioning one
const isEmail = (v: string) => emails(v).length > 0 && spelled(v).replace(ADDRESS, "").replace(/mailto:/gi, "").replace(/[^\p{L}]/gu, "").length <= 30;
// a link, with its https:// or without ("glowclinic.com", "youtube.com/@sunskin"), never a number ("12.5") or a dotted handle ("dr.jane")
const TLD = "com|net|org|io|co|me|info|biz|app|dev|ai|tv|ly|so|xyz|site|online|store|shop|media|health|clinic|care|md|ae|uk|us|ca|au|nz|de|fr|es|it|nl|ch|at|in|pk|mx|br|tr|kr|my|sg|za|ie|be|se|no|dk|pl|pt|jp";
const DOMAIN = new RegExp(`^(www\\.)?[\\w-]+(\\.[\\w-]+)*\\.(${TLD})(\\/\\S*)?$`, "i");
const isUrl = (v: string) => /^https?:\/\/\S+$/i.test(v) || DOMAIN.test(v);
const linkOf = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

// The ways a country is written, the board's tag among them ("US", "U.S.", "United States" for USA)
const COUNTRIES = [
  ["usa", "us", "united states", "united states of america", "america"],
  ["uk", "gb", "united kingdom", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "london"],
  ["uae", "ae", "united arab emirates", "emirates", "dubai", "abu dhabi", "sharjah"],
  ["türkiye", "turkiye", "turkey", "tr"],
  ["mexico", "méxico", "mx"],
  ["brazil", "brasil", "br"],
  ["australia", "au"],
  ["new zealand", "nz"],
  ["austria", "österreich", "at"],
  ["canada", "ca"],
  ["south korea", "korea", "republic of korea", "kr"],
  ["pakistan", "pk"],
  ["italy", "italia", "it"],
  ["malaysia", "my"],
  ["colombia", "co"],
  ["germany", "deutschland", "de"],
  ["india", "in"],
  ["spain", "españa", "es"],
  ["france", "fr"],
  ["ireland", "ie"],
  ["singapore", "sg"],
  ["saudi arabia", "ksa", "sa"],
];
// Every country's English name by its lower case ("italy": "Italy"), from the
// runtime's own list of regions; groupings and test codes aren't countries
let NAMES: Map<string, string> | undefined;
function countryNames() {
  if (!NAMES) {
    const d = new Intl.DisplayNames("en", { type: "region", fallback: "none" });
    NAMES = new Map();
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = /^(EU|EZ|UN|QO|XA|XB|ZZ)$/.test(code) ? undefined : d.of(code);
        if (n) NAMES.set(n.toLowerCase(), n);
      }
  }
  return NAMES;
}
// A real country however it's written ("Milan, Italy", "Italia", "U.S."), by
// its English name ("United States"), else null
export function countryName(value: string): string | null {
  const names = countryNames();
  const named = (v: string) => names.get(v) ?? COUNTRIES.find((g) => g.includes(v))?.map((n) => names.get(n)).find(Boolean) ?? null;
  const v = value.trim().toLowerCase().replace(/\./g, "");
  return v ? (named(v) ?? named(v.split(",").pop()!.trim())) : null;
}
// A value as one of a field's tags: by its name or the start of it ("D1" is
// "D1 · Old hit still on top"), a country however it's written ("U.S.",
// "Dubai, UAE"), a code before other words ("D1 - Old hit"), or the words
// after a tag's code when only one tag has them ("Old hit"). A bare number
// starts a tag only as its code ("1 · Hot"), never as a count ("4" isn't "4
// episodes a month": 4 in 90 days is fewer; Claude reads those, matchTags)
export function matchOption<O extends Pick<OptionData, "name">>(options: O[], value: string): O | undefined {
  const name = (o: O) => o.name.trim().toLowerCase();
  const starts = (o: O, v: string) => name(o).startsWith(`${v} `) && (!/^\d+$/.test(v) || /^\s*[·:|–—-]/.test(name(o).slice(v.length)));
  const is = (v: string) => (v ? (options.find((o) => name(o) === v) ?? options.find((o) => starts(o, v))) : undefined);
  const country = (v: string) => {
    const g = COUNTRIES.find((g) => g.includes(v.replace(/\./g, "")));
    return g && options.find((o) => g.includes(name(o)));
  };
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  const last = v.split(",").pop()!.trim();
  const code = /^([a-z]\d+)\b/.exec(v)?.[1];
  const worded = options.filter((o) => name(o).split(/\s+[·:|–—-]\s+/).slice(1).join(" ").startsWith(v));
  return is(v) ?? country(v) ?? (last !== v ? (is(last) ?? country(last)) : undefined) ?? (code ? is(code) : undefined) ?? (worded.length === 1 ? worded[0] : undefined);
}
// a multi field's comma list, unless the whole of it is one tag
const tagsIn = (f: Pick<FieldData, "kind" | "options">, v: string) =>
  (f.kind === "multi" && !f.options.some((o) => o.name.trim().toLowerCase() === v.trim().toLowerCase()) ? v.split(",") : [v]).map((t) => t.trim()).filter(Boolean);

// Whether a column's values can be what it's placed on: a message has words
// with spaces between (addresses under "Email 1" aren't one), a {{Link}} is
// a link, a count is no one's handle ("YouTube subscribers": 20.4K), a handle
// or a link has no spaces, several in a cell aside ("@a, @b"; so a LinkedIn
// note under "li" isn't taken for a page), a name is one line
function fits(t: Target, values: string[]): boolean {
  if (t.startsWith("message:")) return !values.length || values.some((v) => /\s/.test(v));
  if (/^var:(link|url|website|site)$/i.test(t)) return values.every(isUrl);
  if (t.startsWith("contact.") && t !== "contact.phone" && values.length && values.every((v) => /^[\d.,]+\s*[kmb+]?$/i.test(v))) return false;
  if (t === "contact.email") return values.every(isEmail);
  if (t === "contact.phone") return values.every((v) => /^[+\d\s().-]{5,}$/.test(v));
  if (t === "title" || t === "contact.name" || t === "contact.role") return values.every((v) => v.length <= 200 && !v.includes("\n"));
  if (t === "link" || t.startsWith("contact.")) return values.every((v) => listed(v).every((x) => !/\s/.test(x)));
  return true;
}
// only one column can be the lead's name, a tag field, a variable or a message
const single = (t: Target, board: Board) =>
  t === "title" || t.startsWith("var:") || t.startsWith("message:") || (t.startsWith("field:") && board.fields.find((f) => `field:${f.id}` === t)?.kind !== "multi");
// a picture's address (a profile photo, a post's image) goes nowhere
const PICTURE = /^pic|profilepic|picurl|pictureurl|img|image|photo|avatar|thumb|displayurl/;
const isPicture = (v: string) => /\.(jpe?g|png|webp|gif|heic)(\?|$)|cdninstagram\.com|fbcdn\.net|media\.licdn\.com/i.test(v);
const choice = (f: Pick<FieldData, "kind">) => f.kind === "select" || f.kind === "multi";

// What code can tell on its own: a heading that names a property, a
// variable ({{Name}} or its name), a message or a common heading, else
// values that are plainly emails, profiles, links or the field's own tags.
// A column it can't place is left out of the result.
export function autoMap(columns: Column[], board: Board): Record<string, Target> {
  const vars = boardVars(board);
  const offered = new Set(targetsOf(board).map((t) => t.value));
  const out: Record<string, Target> = {};
  const taken = new Set<Target>();
  // a "Title" beside a company's name in the same record is the person's job
  // (Apollo, Sales Navigator), and so is one in a list's records beside a
  // person's name or email (people[].title, the company at the lead's
  // level); alone it's the lead's name (a podcast directory, a show with its
  // channel's name deep in its research, its videos' titles in a list)
  const beside = (path: string, re: RegExp) => columns.some((c) => c.path !== path && parentOf(c.path) === parentOf(path) && re.test(said(c.path) ?? ""));
  const job = (path: string) => (columns.some((c) => parentOf(c.path) === parentOf(path) && norm(bareName(c.path)) !== "title" && said(c.path) === "title") || (!!listOf(path) && beside(path, /^contact\.(name|email)$/)));
  // beside a list of the lead's people, the lead's own channel, site or
  // profile ("yt" and the show's Instagram "podig" by "people[]") is its
  // link, not the first person's
  const peopleListed = columns.some((c) => listOf(c.path) && /^contact\.(name|email)$/.test(said(c.path) ?? ""));
  for (const { path, values } of columns) {
    const name = nameOf(path);
    const h = norm(name);
    if (PICTURE.test(h) || values.every(isPicture)) {
      out[path] = "ignore";
      continue;
    }
    const braced = /^\{\{(.+)\}\}$/.exec(name.trim())?.[1].trim();
    // a tag field takes a column with its tags in it; named like a variable too ("Opener"), only then
    const tagged = (f: FieldData) => !choice(f) || values.some((v) => tagsIn(f, v).some((t) => matchOption(f.options, t)));
    const field =
      board.fields.find((f) => placed(f) && norm(f.name) === (FIELD_SAID[h] ?? h) && (tagged(f) || !vars.some((v) => norm(v) === h))) ??
      // "YouTube subscribers", "Subs", "Followers (K)"
      board.fields.find((f) => {
        const n = norm(f.name);
        return placed(f) && n.length >= 4 && (h.startsWith(n) || h.endsWith(n) || (h.length >= 3 && n.startsWith(h))) && tagged(f);
      });
    const message = board.messages.find((m) => [m.name, `${m.name} body`, `${m.name} text`, `${m.name} subject`].some((n) => norm(n) === h));
    const named = vars.find((v) => norm(v) === h);
    // values that are a field's tags, when they're more than a letter or a
    // number ("D1", "UK") or the heading names the field ("board"): not a 1/2/3 priority or A/B grade
    const words = new Set(name.toLowerCase().split(/[^a-z0-9]+/));
    const options = board.fields.find(
      (f) =>
        choice(f) &&
        f.options.length &&
        values.every((v) => tagsIn(f, v).every((t) => matchOption(f.options, t))) &&
        (values.every((v) => v.trim().length > 1) || f.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w && words.has(w))),
    );
    // a column of codes inside a record ("m.c": D1, F2), most of them the
    // tags of a field another column already has ("t"): that field's too, so
    // oneEach makes it the label of the opener whose messages are beside it,
    // or leaves it out
    const codes =
      parentOf(path) &&
      values.length &&
      values.every((v) => v.trim().length >= 2 && v.trim().length <= 12) &&
      board.fields.find((f) => f.kind === "select" && taken.has(`field:${f.id}`) && values.filter((v) => matchOption(f.options, v)).length >= values.length / 2);
    // a list in a list's records (a post's tagged users) holds no one of the lead's
    const deep = (path.match(/\[\]\./g) ?? []).length > 1;
    const s = said(path);
    const t = [
      braced && vars.includes(braced) ? `var:${braced}` : undefined,
      field && `field:${field.id}`,
      // a profile's address is the person's, whatever its heading ("url", "profileUrl")
      values.every((v) => /linkedin\.com\/in\//i.test(v)) ? "contact.linkedin" : undefined,
      values.every((v) => /instagram\.com\/[\w.]/i.test(v) && !postLink(v)) ? "contact.instagram" : undefined,
      s === "title" && h === "title" && job(path) ? "contact.role" : s,
      message && `message:${message.id}:${h === norm(`${message.name} subject`) ? "subject" : "body"}`,
      named && `var:${named}`,
      MENTIONS.find(([w]) => norm(bareName(path)).includes(w))?.[1],
      values.every(isEmail) ? "contact.email" : undefined,
      values.every(isUrl) ? "link" : undefined,
      options && `field:${options.id}`,
    ].find((x): x is Target => !!x && offered.has(x) && !taken.has(x) && fits(x, values) && !(deep && (x === "title" || x.startsWith("contact.")))) ?? (codes ? `field:${codes.id}` : undefined);
    if (!t) continue;
    out[path] = peopleListed && !listOf(path) && /^contact\.(youtube|website|instagram|linkedin|x)$/.test(t) && offered.has("link") ? "link" : t;
    if (single(t, board)) taken.add(t);
  }
  return out;
}

// Where what Claude read out goes (importActions extractLeads): it comes in
// the board's own words, so each column is placed by its exact name, never
// guessed from a heading ("Avg. views" and {{Dr. Name}} as they are)
// Every place takes one column, but a person's handles and links can come
// from several ("Email", "Work email"): the first column keeps a place, any
// other one put there is left out. A name is one column ("Dr Karandish", not
// that and the clinic's name joined: several name columns give the fullest)
export const sharedPlace = (t: Target) => (t.startsWith("contact.") && t !== "contact.role") || t === "link" || t === "notes" || t === "ignore";
// One person written twice (two Notion pages for one doctor, "Sophie
// Shotter" and "Dr Sophie Shotter") is one contact: the same name once titles
// and letters' styles are set aside (one name's words all in the other's), or
// an email or handle in common, unless both are full names that differ. They
// keep the fullest name and every handle.
const TITLES = new Set(["dr", "doctor", "md", "do", "facs", "phd", "mbbs", "dds", "dmd", "frcs", "pa", "pac", "np", "rn", "prof", "mr", "mrs", "ms", "miss"]);
const nameWords = (name = "") =>
  new Set(
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w && !TITLES.has(w)),
  );
const HANDLES = ["email", "instagram", "linkedin", "youtube", "phone", "x", "website"] as const;
type HandleKey = (typeof HANDLES)[number];
// an address of one post, or of a company's page, rather than a person's
// profile: an Instagram reel or post, a LinkedIn post or company page, a
// YouTube video or Short
export const postLink = (v: string) =>
  /instagram\.com\/(reels?|p|tv|stories|explore)\//i.test(v) || /linkedin\.com\/(posts|feed|pulse|company|school|showcase)\//i.test(v) || /youtube\.com\/(watch|shorts)\b|youtu\.be\//i.test(v);
// a mailbox a whole practice shares, which says nothing about who reads it
const SHARED = /^(info|hello|hi|contact|office|admin|bookings?|reception|enquir(y|ies)|inquir(y|ies)|team|support|mail|appointments?|clinic|frontdesk|marketing|sales)@/i;
// One way to reach someone, however it's written ("@drjane",
// "instagram.com/drjane/"): its platform and handle, or the email. None for a
// shared inbox, a website or a phone, which people at one clinic share.
function reachKey(kind: string, v: string): string | null {
  const e = emails(v)[0];
  if (e) return SHARED.test(e) ? null : `email:${e}`;
  if (postLink(v)) return null;
  const host = /\b(youtube|instagram|linkedin|tiktok|twitter|x)\.com\//i.exec(v)?.[1].toLowerCase();
  const k = host === "twitter" ? "x" : (host ?? kind);
  if (!["instagram", "linkedin", "youtube", "x", "tiktok"].includes(k)) return null;
  const h = handleOf(v) ?? v.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return `${k}:${h.replace(/^@/, "").toLowerCase()}`;
}
const handlesOf = (c: ContactIn) => HANDLES.flatMap((k) => (c[k] ?? []).map((v) => reachKey(k, v))).filter((k): k is string => !!k);
// a value onto a person, unless they have it already, however it's written
function add(c: ContactIn, k: HandleKey, v: string) {
  const key = (x: string) => (k === "phone" ? x.replace(/\D/g, "") : (reachKey(k, x) ?? x.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "")));
  const list = (c[k] ??= []);
  if (list.length < 20 && !list.some((x) => key(x) === key(v))) list.push(v);
}
// a person's name before a channel's ("Dr Karandish", not "Dr. K | PCH MedSpa"), then the longest
const channelish = (n: string) => /\s[|/–-]\s|\|/.test(n);
export const fullest = (names: (string | undefined)[]) =>
  names
    .map((n) => n?.trim())
    .filter((n): n is string => !!n)
    .sort((a, b) => Number(channelish(a)) - Number(channelish(b)) || [...b].length - [...a].length)[0];
// ...and before a business's ("Dr Jane Doe", not "Glow Aesthetics Clinic")
const person = (names: string[]) => fullest(names.filter((n) => !businessLike(n))) ?? fullest(names);
export function samePeople(people: ContactIn[]): ContactIn[] {
  const out: ContactIn[] = [];
  for (const c of people) {
    const words = nameWords(c.name);
    const handles = new Set(handlesOf(c));
    const same = out.find((o) => {
      const ow = nameWords(o.name);
      const named = words.size > 0 && ow.size > 0 && ([...words].every((w) => ow.has(w)) || [...ow].every((w) => words.has(w)));
      const apart = words.size > 1 && ow.size > 1 && !named;
      return named || (!apart && handlesOf(o).some((h) => handles.has(h)));
    });
    if (same) join(same, c);
    else out.push({ ...c });
  }
  // a practice or channel written as a person ("Dr. Katzen Plastic Surgery",
  // "MYAutoimmuneMD") beside the doctor on the same lead is the doctor's own
  // page, not someone else: folded into the doctor (two practices stay two)
  const person = out.find((c) => !businessLike(c.name));
  if (!person) return out;
  for (const c of out.filter((c) => c !== person && businessLike(c.name))) join(person, c, true);
  return out.filter((c) => c === person || !businessLike(c.name));
}
// one contact's handles (and a better name and a role, unless only handles count) into another
function join(into: ContactIn, c: ContactIn, handlesOnly = false) {
  if (!handlesOnly) {
    const name = fullest([into.name, c.name]);
    if (name) into.name = name;
    if (!into.role && c.role) into.role = c.role;
  }
  for (const k of HANDLES) for (const v of c[k] ?? []) add(into, k, v);
}
const PRACTICE = /\b(clinic|surgery|plasticsurgery|institute|cent(er|re)|med ?spa|aesthetics?|dermatology|derm|skin|medical|health|wellness|hospital|spa|group|associates|studio|plastic)\b/i;
// a name that reads as a business or a channel: practice words, or a
// channel's name run together ("MYAutoimmuneMD", not "LaToya" or "McDonald")
const businessLike = (name = "") => PRACTICE.test(name) || (/^\S{8,}$/.test(name.trim()) && /[a-z][A-Z]/.test(name) && /md|doc|clinic|skin|derm|tv|official|\d/i.test(name));
// "Dr. Ross Kopelman  Dr. Joel Kopelman" in one cell is two people
const apartPeople = (c: ContactIn): ContactIn[] => {
  if (!/^(dr|doctor)\b/i.test(c.name ?? "")) return [c];
  const [first, ...more] = c.name!.split(/\s*(?:&|\band\b|,)?\s+(?=(?:dr|doctor)\b\.?\s)/i);
  return [{ ...c, name: first }, ...more.map((name) => ({ name }))];
};

// A greeting is never anyone's name (Abhishek, 23 Oct 2026: 30 contacts came
// in as "there" and "Dr Kim"): a column headed like one ("Greeting name",
// "Salutation", "Hi", "Dear ..."), and a name that's only a greeting word
const greetingHead = (path: string) => /^(greeting|salutation|dear)|^(hi|hello|hey)(name)?$/.test(norm(bareName(path)));
export const isGreeting = (name = "") => /^(there|team|all|everyone|everybody|friends?|sir|madam|ma'?am|folks|guys)?$/i.test(name.trim().replace(/[\s!,.:;]+$/, ""));

// One column per place; a message's two columns (its whole text and a line
// from it) keep the longest, anything else the first. A message or a
// variable only takes values that can be one (Claude's choices too: never a
// sentence on {{Link}}), and each list of backups (alt[]) has its own, as
// each version of a message does. A column writing several messages holds
// each of them on its own. A tag code beside an opener's messages ("m.c":
// D1, when "t" has the Opener field) names that opener ("label:<field id>").
// A greeting column is never the contact's name.
export function oneEach(columns: Column[], mapping: Record<string, Target>): Record<string, Target> {
  const length = (c: Column) => c.values.reduce((n, v) => n + v.length, 0) / (c.values.length || 1);
  const openers = new Set(
    Object.keys(mapping)
      .filter((p) => mapping[p].startsWith("message:"))
      .map(parentOf)
      .filter(Boolean),
  );
  const out: Record<string, Target> = {};
  const holder = new Map<string, Column>();
  for (const c of columns) {
    let t = mapping[c.path] ?? "ignore";
    if (((t.startsWith("message:") || t.startsWith("var:")) && !fits(t, c.values)) || (t === "contact.name" && greetingHead(c.path))) t = "ignore";
    out[c.path] = t;
    if (sharedPlace(t)) continue;
    for (const one of targetsIn(t)) {
      const key = one.startsWith("message:") || one.startsWith("var:") || one === "contact.role" ? `${one}@${listOf(c.path)}${personOf(c.path)}` : one;
      const was = holder.get(key);
      if (!was) {
        holder.set(key, c);
        continue;
      }
      const [keep, drop] = one.startsWith("message:") && length(c) > length(was) ? [c, was] : [was, c];
      holder.set(key, keep);
      out[drop.path] = one.startsWith("field:") && openers.has(parentOf(drop.path)) ? `label:${one.slice(6)}` : targetsIn(out[drop.path]).filter((x) => x !== one).join("|") || "ignore";
    }
  }
  return out;
}

export function placeExtracted(columns: Column[], board: Board): Record<string, Target> {
  return Object.fromEntries(
    columns.map(({ path }) => {
      const field = board.fields.find((f) => placed(f) && f.name === path);
      const v = /^\{\{(.+)\}\}$/.exec(path)?.[1];
      const t = path === "title" ? "title" : path === "links[]" ? "link" : path.startsWith("contacts[].") ? `contact.${path.slice(11)}` : field ? `field:${field.id}` : v ? `var:${v}` : "ignore";
      return [path, t];
    }),
  );
}

// ---- The leads, as add_leads takes them ----

export type ContactIn = { name?: string; role?: string } & Partial<Record<Exclude<ContactKey, "name" | "role">, string[]>>;
export type DraftIn = { subject: string; body: string };
export type LeadIn = {
  title: string;
  // by field id; tags by option id, a Country the board lacks by its name
  values?: Record<string, unknown>;
  contacts?: ContactIn[];
  links?: { label: string; url: string }[];
  vars?: Record<string, string>;
  notes?: string;
  // the main opener first, then one per element of a list of them ("alt[]")
  openers?: { label: string; drafts: Record<string, DraftIn> }[];
};
export type Preview = {
  leads: LeadIn[];
  // already on the board (by name or by an email or handle on it): skipped, unless added anyway
  duplicates: LeadIn[];
  // left out, and why ("Row 4": no name). A property the board requires
  // never keeps a lead out: it goes in with that left empty (Abhishek, 24 Oct
  // 2026), as the manual form's rule can't make a file have the value
  incomplete: { name: string; why: string }[];
  // imported, but nobody on them has an email, Instagram or LinkedIn yet
  unreachable: string[];
  existing: number;
  // without a name
  unnamed: number;
  // values that aren't one of their field's tags, as "Country: India"
  unmatched: string[];
};

// A yes or a no on a field whose tags are Yes and No: "true", "1" and "y" are Yes
const YES = /^(true|yes|y|1)$/i;
const NO = /^(false|no|n|0)$/i;
const yesNo = <O extends Pick<OptionData, "name">>(options: O[], v: string) => {
  const want = YES.test(v.trim()) ? "yes" : NO.test(v.trim()) ? "no" : "";
  return want ? options.find((o) => o.name.trim().toLowerCase() === want) : undefined;
};
const isCountry = (f: Pick<FieldData, "name">) => /^country$/i.test(f.name.trim());
// what a value is called in Claude's answer about tags (importActions
// matchTags), as much of it as Claude is shown
export const tagKey = (v: string) => v.trim().slice(0, 80).toLowerCase();
// Tags Claude matched to values code couldn't, by field id and value: the option's id
export type ToldTags = Record<string, Record<string, string>>;

// A property's value from the column's words, as add_leads stores it, or
// null; a tag by code, else as Claude matched it (told), else left off
function valueOf(f: FieldData, vs: string[], unmatched: Set<string>, told: Record<string, string> = {}): unknown {
  switch (f.kind) {
    case "select":
    case "multi": {
      const ids = vs
        .flatMap((v) => tagsIn(f, v))
        .flatMap((t) => {
          const o = matchOption(f.options, t) ?? yesNo(f.options, t);
          if (o) return [o.id];
          if (told[tagKey(t)]) return [told[tagKey(t)]];
          // a real country the board has no tag for yet goes by name: importLeads adds the tag
          const country = isCountry(f) ? countryName(t) : null;
          if (country) return [country];
          unmatched.add(`${f.name}: ${t}`);
          return [];
        });
      const unique = [...new Set(ids)];
      return unique.length ? unique.slice(0, f.kind === "select" ? 1 : undefined) : null;
    }
    case "count": {
      // "1,200", "1.2K"; anything else is kept as words
      const m = /^\s*([\d.,]+)\s*([km])?\s*$/i.exec(vs[0]);
      const n = m ? Number(m[1].replace(/,/g, "")) * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1) : NaN;
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

// A person's value where it belongs, whichever column it came in: an
// address is their email, a profile their platform's ("instagram.com/drjane"
// under Website); a post's or a company page's address is the lead's link
// (into `posts`), a cell's link kept from its words ("www.glow.com (main)")
const PROFILES: [HandleKey, RegExp][] = [
  ["linkedin", /linkedin\.com\/in\//i],
  ["instagram", /instagram\.com\/[\w.]/i],
  ["youtube", /youtube\.com\/(@|c\/|channel\/|user\/)/i],
  ["x", /\b(twitter|x)\.com\/\w/i],
];
function put(c: ContactIn, k: HandleKey, v: string, posts: string[]) {
  if (k === "email" || emails(v).length) return emails(v).forEach((e) => add(c, "email", e));
  if (postLink(v)) return void posts.push(v);
  const to = PROFILES.find(([, re]) => re.test(v))?.[0] ?? k;
  if (to === "phone") return void ((v.match(/\d/g) ?? []).length >= 5 && add(c, "phone", v.slice(0, 60)));
  const token = /\s/.test(v) ? v.split(/\s+/).find((w) => /^@[\w.]+$/.test(w) || isUrl(w)) : v;
  if (token) add(c, to, token.slice(0, 300));
}
// several in one cell: "@a, @b", "a / b", "@a @b"
const listed = (v: string) =>
  v
    .split(/\s*[,;|\n]\s*|\s+\/\s+|\s+(?=@|https?:\/\/)/)
    .map((s) => s.trim())
    .filter(Boolean);
const PHONE = (v: string) => /^\+?[\d\s().-]{7,}$/.test(v) && (v.match(/\d/g) ?? []).length >= 7;
// one way to tell a lead by its name: without case, accents, a leading Dr,
// spaces or punctuation ("Dr. K | PCH MedSpa" is "Dr K | PCH MedSpa")
const titleKey = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^\s*(dra?|doctor)\b\.?\s*/, "")
    .replace(/[^\p{L}\p{N}]/gu, "") || t.trim().toLowerCase();
// the ways a lead can be reached: its people's emails and handles, its channels
const reachOf = (l: LeadIn) => [...(l.contacts ?? []).flatMap(handlesOf), ...(l.links ?? []).map((x) => reachKey("", x.url))].filter((k): k is string => !!k);
// ...and a lead's on the board, from its Contacts and Links
type BoardLead = Pick<LeadData, "title"> & Partial<Pick<LeadData, "values">>;
const boardReach = (l: BoardLead, fields: Pick<FieldData, "id" | "kind">[]) =>
  fields.flatMap((f) => {
    const v = l.values?.[f.id];
    if (!Array.isArray(v)) return [];
    if (f.kind === "contacts") return (v as { channels?: { kind: string; value: string }[] }[]).flatMap((c) => (c?.channels ?? []).map((ch) => reachKey(ch.kind, String(ch.value ?? ""))));
    if (f.kind === "links") return (v as { url?: string }[]).map((x) => reachKey("", String(x?.url ?? "")));
    return [];
  });
// a lead written again (one row per person at a clinic, a lead cut across two
// parts or pictures): its people, its links and what the first one lacks
function merge(into: LeadIn, l: LeadIn) {
  const contacts = samePeople([...(into.contacts ?? []), ...(l.contacts ?? [])]).slice(0, 50);
  if (contacts.length) into.contacts = contacts;
  const links = [...(into.links ?? []), ...(l.links ?? [])].filter((x, i, all) => all.findIndex((y) => y.url === x.url) === i).slice(0, 50);
  if (links.length) into.links = links;
  if (l.values) into.values = { ...l.values, ...into.values };
  if (l.vars) into.vars = { ...l.vars, ...into.vars };
  if (l.notes && !into.notes?.includes(l.notes)) into.notes = [into.notes, l.notes].filter(Boolean).join("\n\n").slice(0, 10_000);
  if (!into.openers?.length && l.openers?.length) into.openers = l.openers;
}

// The values on a tag property that code can't match to a tag (a count of
// episodes on "Podcast cadence"), for one Claude call (importActions
// matchTags): each field's column, its different values, and a couple of
// rows' values beside it in its record, which say what the values are
// ("eps90" beside "sample_window": 90)
export type TagAsk = { field: string; column: string; values: string[]; beside: Record<string, string>[] };
export function tagsToAsk(rows: Row[], mapping: Record<string, Target>, board: Pick<BoardData, "fields">): TagAsk[] {
  const flats = rows.map((r) => flatten(r));
  const out: TagAsk[] = [];
  // as many as one answer holds (about 30 tokens each, importActions matchTags)
  let room = 100;
  for (const f of board.fields.filter(choice))
    for (const column of Object.keys(mapping).filter((p) => mapping[p] === `field:${f.id}`)) {
      const values = new Map<string, string>();
      const beside: Record<string, string>[] = [];
      const near = (p: string) => parentOf(p) === parentOf(column) && !p.slice(parentOf(column).length).includes("[]");
      for (const flat of flats) {
        const left = (flat[column] ?? []).flatMap((v) => tagsIn(f, v)).filter((t) => !matchOption(f.options, t) && !yesNo(f.options, t) && !(isCountry(f) && countryName(t)));
        if (!left.length) continue;
        for (const t of left) if (values.size < Math.min(60, room)) values.set(tagKey(t), t.trim().slice(0, 80));
        if (beside.length < 2) beside.push(Object.fromEntries(Object.entries(flat).filter(([p, vs]) => near(p) && vs.length === 1).slice(0, 25).map(([p, vs]) => [p, vs[0].slice(0, 60)])));
      }
      room -= values.size;
      if (values.size) out.push({ field: f.id, column, values: [...values.values()], beside });
    }
  return out;
}

// A blank written in single braces for whoever sends it ("{AVG}", "{Guest
// name}") is a fill-in, {{AVG}}, so the Fill in form asks for it and its day
// waits for it; only words in the braces, never JSON or code. One the board
// has, however the file spells it, is the board's ({podcast} is {{Podcast}},
// {first_name} and {FNAME} are {{Name}}), so it fills itself in.
const braced = (text: string, vars: string[] = []) =>
  text.replace(/(?<![{$])\{\s*(\p{L}[\p{L}\p{N} _]{0,39}?)\s*\}(?!\})/gu, (_, v: string) => `{{${vars.find((b) => norm(b) === norm(v)) ?? (/^(first|firstname|fname)$/.test(norm(v)) && vars.includes("Name") ? "Name" : v)}}}`);
const escaped = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Words the lead has as a variable's value, a name (the show, its guest, a
// greeting's "Dr Kay": a capital letter in it, eight words at most), are
// that variable wherever its messages have them, so a sentence no other lead
// shares still fills in from the Fill in form (Abhishek, 24 Oct 2026: guests
// and shows stayed written out); never a variable's sentences, nor words
// inside a {{Variable}}
const nameLike = (v: string) => v.length >= 3 && v.length <= 60 && /\p{Lu}/u.test(v) && v.split(/\s+/).length <= 8;
const asVars = (text: string, vars: Record<string, string>) => {
  const named = Object.entries(vars)
    .filter(([, v]) => nameLike(v))
    .sort((a, b) => b[1].length - a[1].length);
  if (!named.length) return text;
  return text
    .split(/(\{\{[^{}]*\}\})/)
    .map((part, i) => (i % 2 ? part : named.reduce((t, [n, v]) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped(v)}(?![\\p{L}\\p{N}])`, "gu"), `{{${n}}}`), part)))
    .join("");
};
// A person's own first name where their messages greet them ("Hey Michelle,",
// "Michelle," on its line, "Thanks for connecting, Michelle.") is {{Name}},
// which the lead window fills with each person's own (lib/space varsFor)
const greetName = (text: string, first?: string) =>
  first && /\p{L}{2}/u.test(first) ? text.replace(new RegExp(`(?<=^|\\b(?:[Hh]i|[Hh]ey|[Hh]ello|[Dd]ear|[Tt]hanks|[Tt]hank you)[ ,]*|, )${escaped(first)}(?=[\\s,.!?:;]|$)`, "gmu"), "{{Name}}") : text;

// Every row as a lead, in add_leads' limits (lib/mcp/tools.ts leadIn), and
// what the preview counts: the ones already on the board (by name, as
// add_leads dedupes, or by an email or handle a lead there has), those
// without a name, tags not found (told: the ones Claude matched). A lead the
// file has twice (by name, email or handle) is one lead with everything from both.
export function buildLeads(rows: Row[], mapping: Record<string, Target>, board: Pick<BoardData, "fields"> & Partial<Pick<BoardData, "messages">> & { leads: BoardLead[] }, told: ToldTags = {}): Preview {
  const paths = Object.keys(mapping).filter((p) => mapping[p] !== "ignore");
  const to = (prefix: string) => paths.filter((p) => mapping[p].startsWith(prefix));
  const contactPaths = to("contact.");
  const messagePaths = to("message:");
  // lists of people (docs[]; doctors[] and assistants[]) make one person each;
  // a list of openers (alt[]) a backup each. A people list's messages are one
  // person's words with each one's name, so the lead takes them once, from
  // the first person who has them (lib/leadTemplates makes the name {{Name}})
  const peopleLists = [...new Set(contactPaths.map(listOf).filter(Boolean))];
  const spoken = [...new Set(messagePaths.map(listOf).filter((l) => peopleLists.includes(l)))];
  const backups = messagePaths.map(listOf).find((l) => l && !peopleLists.includes(l)) ?? "";
  const inBackup = (p: string) => !!backups && p.startsWith(backups);
  const mainPaths = paths.filter((p) => !inBackup(p));
  const valuesFor = (flat: Flat, t: Target, among = paths) => among.filter((p) => mapping[p] === t).flatMap((p) => flat[p] ?? []);
  const varNames = [...new Set(to("var:").map((p) => mapping[p].slice(4)))];
  const named = boardVars({ messages: board.messages ?? [] });
  // a row's own people columns, and each numbered person's ("Contact 2 Email")
  const top = contactPaths.filter((p) => !listOf(p));
  const numbers = [...new Set(top.map(personOf).filter(Boolean))];
  const pick = (flat: Flat, among: string[]) => Object.fromEntries(among.filter((p) => flat[p]).map((p) => [p, flat[p]]));
  // with a name column the people's names are only theirs; without one, a business among them names the lead
  const titled = to("title").length > 0;
  const linked = board.fields.some((f) => f.kind === "links");

  // the name a lead's person is greeted by ({{Greeting name}}: "Dr Karandish")
  // is theirs too, beside a list's names that read like a channel's, when
  // the file has them as a person at all
  const greeted = board.fields.some((f) => f.kind === "contacts") ? to("var:").filter((p) => !listOf(p) && /^(greeting name|first name|full name|name)$/i.test(mapping[p].slice(4))) : [];

  const contactOf = (flat: Flat, posts: string[], also: string[] = []): ContactIn | null => {
    const c: ContactIn = {};
    const names: string[] = [];
    for (const p of contactPaths) {
      const vs = flat[p];
      if (!vs?.length) continue;
      const k = mapping[p].slice(8) as ContactKey;
      if (k === "name") names.push(...vs.filter((v) => !isGreeting(v)));
      else if (k === "role") c.role = [c.role, ...vs].filter(Boolean).join(", ").slice(0, 60);
      else for (const v of vs.flatMap(listed)) put(c, k, v, posts);
    }
    if (Object.keys(c).length || names.length) names.push(...also.filter((v) => !isGreeting(v)));
    // "First name", "Middle name" and "Last name" are one name; else the fullest of its names, never two joined
    const parts = NAME_PARTS.map((re) => contactPaths.find((p) => mapping[p] === "contact.name" && re.test(norm(bareName(p))) && flat[p]?.length)).map((p) => p && flat[p][0]);
    const name = (titled ? fullest : person)([...names, parts.filter(Boolean).join(" ")]);
    // in plain letters, not a profile's bold ones ("𝐃𝐫. 𝐀𝐥𝐞𝐱𝐞𝐲")
    if (name) c.name = (/[\u{1D400}-\u{1D7FF}]/u.test(name) ? name.normalize("NFKC") : name).slice(0, 120);
    return Object.keys(c).length ? c : null;
  };
  // a written-out message as the lead's draft (each one its column writes;
  // with a version, that version's and the ones every version shares); a
  // backup's own words ({{Subject}} from alt[].s) filled in
  // (first: the person whose words they are, by the first name they go by; vars: the lead's)
  const draftsOf = (flat: Flat, among: string[], own: Record<string, string> = {}, version?: string, first?: string, vars: Record<string, string> = {}) => {
    const out: Record<string, DraftIn> = {};
    for (const p of among) {
      const v = flat[p]?.join("\n\n");
      if (!v) continue;
      // "[link]" left in a sequence page's wording is the {{Link}} fill-in (Abhishek, 23 Oct 2026)
      const text = asVars(greetName(braced(v.replaceAll("[link]", "{{Link}}"), named), first), vars);
      for (const t of targetsIn(mapping[p])) {
        const [, id, part, of = ""] = t.split(":");
        if (version !== undefined && of && of !== version) continue;
        const d = (out[id] ??= { subject: "", body: "" });
        if (part === "subject") d.subject ||= text.slice(0, 300);
        else d.body ||= text.slice(0, 20_000);
      }
    }
    // an email that came without its subject keeps the board's ("{{Subject}}")
    for (const [id, d] of Object.entries(out)) d.subject ||= board.messages?.find((m) => m.id === id)?.subject ?? "";
    return Object.fromEntries(
      Object.entries(out)
        .filter(([, d]) => d.body)
        .map(([id, d]) => [id, { subject: fillText(d.subject, own), body: fillText(d.body, own) }]),
    );
  };
  // a backup's own words in the board's messages that use them, where it has no draft of its own
  const rewritten = (own: Record<string, string>) =>
    Object.fromEntries(
      (board.messages ?? []).filter((m) => variablesIn([m.subject, m.body]).some((v) => v in own)).map((m) => [m.id, { subject: fillText(m.subject, own), body: fillText(m.body, own) }]),
    );
  // what names an opener: a tag code beside its messages ("D2" for "D2 · View swing"), as the file has it otherwise ("F1")
  const labelOf = (flat: Flat, among: string[]) => {
    const p = among.find((x) => mapping[x].startsWith("label:") && flat[x]?.length);
    const f = p ? board.fields.find((x) => x.id === mapping[p].slice(6) && x.kind === "select") : undefined;
    return p && f ? (matchOption(f.options, flat[p][0])?.name ?? flat[p][0]).slice(0, 60) : "";
  };

  // Versions of a message (Abhishek, 24 Oct 2026: a file words Days 3 to 5
  // two ways for each lead) are openers of their own, named by their
  // version, in the order their columns come; each carries the messages every
  // version shares. A column whose every value names a version puts the one
  // it names first: by the words only that version's columns have in their
  // names ("asset" for d3_asset, "b" for day3_b), else by the version's name
  const versions = [...new Set(messagePaths.filter((p) => !inBackup(p)).flatMap((p) => targetsIn(mapping[p]).map(versionOf)).filter(Boolean))];
  const flats = rows.map((r) => flatten(r));
  const wordsOf = (v: string) => new Set(messagePaths.filter((p) => targetsIn(mapping[p]).some((t) => versionOf(t) === v)).flatMap((p) => p.split(/[^A-Za-z0-9]+/).map(norm).filter(Boolean)));
  const own = new Map(versions.map((v) => [v, [...wordsOf(v)].filter((w) => versions.every((x) => x === v || !wordsOf(x).has(w)))]));
  const alike = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
  const versionNamed = (value: string) => {
    const a = norm(value);
    const byColumn = versions.filter((v) => own.get(v)!.some((w) => alike(a, w)));
    return byColumn.length === 1 ? byColumn[0] : versions.find((v) => a.length >= 3 && alike(a, norm(v)));
  };
  const chooser =
    versions.length > 1
      ? Object.keys(Object.assign({}, ...flats)).find((p) => !listOf(p) && !paths.includes(p) && flats.some((f) => f[p]) && flats.every((f) => !f[p] || (f[p].length === 1 && versionNamed(f[p][0]))))
      : undefined;

  const unmatched = new Set<string>();
  const out: Preview = { leads: [], duplicates: [], incomplete: [], unreachable: [], existing: 0, unnamed: 0, unmatched: [] };
  const kept: LeadIn[] = [];
  const byTitle = new Map<string, LeadIn>();
  const byReach = new Map<string, LeadIn>();
  for (const [n, row] of rows.entries()) {
    const flat = flats[n];

    // people: one per element of their lists and per numbered person, the row's other columns on the first
    const groups = [...numbers.map((num) => pick(flat, top.filter((p) => personOf(p) === num))), ...peopleLists.flatMap((l) => elementsAt(row, l).map((e) => flatten(e, l)))];
    groups[0] = { ...groups[0], ...pick(flat, top.filter((p) => !personOf(p))) };
    const posts: string[] = [];
    const contacts = samePeople(
      groups
        .map((g, i) => contactOf(g, posts, i ? [] : greeted.flatMap((p) => flat[p] ?? [])))
        .filter((c): c is ContactIn => !!c)
        .flatMap(apartPeople),
    ).slice(0, 50);
    // only real addresses (a page's labels, "YT 1", aren't links); an email, a
    // phone or a person's profile put there is the first person's, though
    // beside a list of people a profile is the lead's own (a show's Instagram)
    const spill: ContactIn = {};
    const links: string[] = [];
    for (const v of [...valuesFor(flat, "link"), ...posts].flatMap(listed)) {
      if (emails(v).length || PHONE(v) || (!peopleLists.length && PROFILES.some(([k, re]) => k !== "youtube" && re.test(v)) && !postLink(v))) put(spill, PHONE(v) ? "phone" : "website", v, links);
      else if (isUrl(v)) links.push(linkOf(v));
    }
    if (Object.keys(spill).length) join(contacts[0] ?? (contacts[0] = {}), spill, true);
    // a "person" that's only a site, with no name or role (a shortlist's
    // website column, no people in the file), is the lead's link
    const site = (c: ContactIn) => linked && !c.name && !c.role && Object.keys(c).every((k) => k === "website" || k === "youtube");
    for (const c of contacts.filter(site)) links.push(...[...(c.website ?? []), ...(c.youtube ?? [])].filter(isUrl).map(linkOf));
    const persons = contacts.filter((c) => !site(c));

    // without a name column: a business among the people's names ("Glow
    // Aesthetics Clinic" beside "Dr Jane Doe"), else the people, else a handle
    const business = top.filter((p) => mapping[p] === "contact.name").flatMap((p) => flat[p] ?? []).find(businessLike);
    const handle = contacts.flatMap((c) => [...(c.instagram ?? []), ...(c.email ?? [])])[0];
    const named =
      to("title")
        .map((p) => flat[p])
        .find((v) => v?.length) ?? (business ? [business] : contacts.some((c) => c.name) ? contacts.flatMap((c) => c.name ?? []) : handle ? [handleOf(handle) ?? handle] : []);
    const written = named.join(" / ").trim().replace(/\s+/g, " ").slice(0, 200);
    // an @handle as the name ("@drjanedoe") gives way to the person's own name when the file has it
    const person = contacts.find((c) => c.name?.trim() && !c.name.trim().startsWith("@"))?.name?.trim();
    const title = written.startsWith("@") && person ? person.slice(0, 200) : written;
    if (!title) {
      out.unnamed++;
      out.incomplete.push({ name: `Row ${n + 1}`, why: "no name" });
      continue;
    }

    const values: Record<string, unknown> = {};
    for (const f of board.fields.filter(placed)) {
      const vs = valuesFor(flat, `field:${f.id}`);
      const v = vs.length ? valueOf(f, vs, unmatched, told[f.id]) : null;
      if (v != null) values[f.id] = v;
    }
    // a variable's value is the lead's own, never a backup's (each backup fills its own openers)
    const vars = Object.fromEntries(varNames.map((v) => [v.slice(0, 60), (valuesFor(flat, `var:${v}`, mainPaths)[0] ?? "").slice(0, 2000)]).filter(([, v]) => v));
    // the messages: a people list's are each person's words, their own first
    // name as {{Name}}. The first person's go in, and another's only where
    // their words differ beyond that (a co-host's "with Michelle" beside the
    // first's "with Carter", their own hook), as openers of their own named by them
    const speakers = spoken.map((l) =>
      elementsAt(row, l)
        .map((e) => flatten(e, l))
        .filter((ef) => messagePaths.some((p) => listOf(p) === l && ef[p]?.length)),
    );
    const wordsOf = (k: number) => {
      const words = { ...flat };
      for (const [i, l] of spoken.entries()) for (const p of messagePaths.filter((x) => listOf(x) === l)) words[p] = speakers[i][i ? 0 : k]?.[p] ?? [];
      return words;
    };
    // the first name each goes by: the file's own (a "first" column), else their name's (lib/space firstName)
    const firstOf = (ef: Flat | undefined) => {
      const given = ef && contactPaths.find((p) => mapping[p] === "contact.name" && NAME_PARTS[0].test(norm(bareName(p))) && ef[p]?.length);
      return ef && (given ? ef[given][0] : firstName(fullest(contactPaths.filter((p) => mapping[p] === "contact.name").flatMap((p) => ef[p] ?? [])) ?? ""));
    };
    // the sequence's other messages go with every opener (as doctors-setup did)
    const mainMessages = messagePaths.filter((p) => !inBackup(p));
    const chosen = chooser && flat[chooser] ? versionNamed(flat[chooser][0]) : undefined;
    const openersOf = (k: number) => {
      const words = wordsOf(k);
      const first = firstOf(speakers[0]?.[k]);
      const who = (label: string) => (k ? [first ?? `Person ${k + 1}`, label].filter(Boolean).join(" · ") : label);
      const present = versions.filter((v) => mainMessages.some((p) => words[p]?.length && targetsIn(mapping[p]).some((t) => versionOf(t) === v)));
      return present.length
        ? [...present].sort((a, b) => Number(b === chosen) - Number(a === chosen)).map((v) => ({ label: who(v), drafts: draftsOf(words, mainMessages, {}, v, first, vars) }))
        : [{ label: who(labelOf(flat, mainPaths)), drafts: draftsOf(words, mainMessages, {}, undefined, first, vars) }];
    };
    const firsts = openersOf(0);
    const said = (os: { drafts: Record<string, DraftIn> }[]) => JSON.stringify(os.map((o) => o.drafts));
    const others = (speakers[0] ?? []).slice(1).flatMap((_, i) => {
      const os = openersOf(i + 1);
      return said(os) === said(firsts) ? [] : os;
    });
    const main = firsts[0].drafts;
    const backup = (e: unknown) => {
      const ef = flatten(e, backups);
      const own = Object.fromEntries(to("var:").filter((p) => inBackup(p) && ef[p]).map((p) => [mapping[p].slice(4), ef[p][0]]));
      return { label: labelOf(ef, paths), drafts: { ...main, ...rewritten(own), ...draftsOf(ef, messagePaths, own, undefined, undefined, vars) } };
    };
    const openers = [...firsts, ...others, ...(backups ? elementsAt(row, backups).map(backup) : [])].filter((o) => Object.keys(o.drafts).length).slice(0, 10);

    // each notes column a paragraph, a list's items a line each
    const notes = to("notes")
      .map((p) => (flat[p] ?? []).join("\n"))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 10_000);
    const lead: LeadIn = {
      title,
      ...(Object.keys(values).length ? { values } : {}),
      ...(persons.length ? { contacts: persons } : {}),
      ...(links.length ? { links: [...new Set(links)].slice(0, 50).map((url) => ({ label: "", url: url.slice(0, 500) })) } : {}),
      ...(Object.keys(vars).length ? { vars } : {}),
      ...(notes ? { notes } : {}),
      ...(openers.length ? { openers } : {}),
    };
    const reach = reachOf(lead);
    const earlier = byTitle.get(titleKey(title)) ?? reach.map((k) => byReach.get(k)).find(Boolean);
    if (earlier) merge(earlier, lead);
    else {
      byTitle.set(titleKey(title), lead);
      kept.push(lead);
    }
    for (const k of reach) if (!byReach.has(k)) byReach.set(k, earlier ?? lead);
  }

  const onBoard = new Set(board.leads.map((l) => titleKey(l.title)));
  const reachable = new Set(board.leads.flatMap((l) => boardReach(l, board.fields)));
  for (const lead of kept) {
    if (onBoard.has(titleKey(lead.title)) || reachOf(lead).some((k) => reachable.has(k))) {
      out.existing++;
      out.duplicates.push(lead);
    } else out.leads.push(lead);
  }
  if (board.fields.some((f) => f.kind === "contacts")) out.unreachable = unreachable(out.leads);
  out.unmatched = [...unmatched];
  return out;
}

// Whether anyone on a lead can be written to (an email, Instagram or
// LinkedIn), and the leads nobody on can be: the dialog asks again once their
// links have been read (importActions findContacts)
export const reachable = (l: Pick<LeadIn, "contacts">) => !!l.contacts?.some((c) => c.email?.length || c.instagram?.length || c.linkedin?.length);
export const unreachable = (leads: LeadIn[]) => leads.filter((l) => !reachable(l)).map((l) => l.title);

// ---- Claude's part: words and pictures, in pieces ----

export type Part = { text?: string; images?: string[] };
// About 6,000 characters, or two pictures (under 3 MB together, well inside
// a server action's 4.5 MB), per call: few enough leads that Claude's answer
// comes well inside the page's minute (importActions extractLeads). A line
// longer than that (a page or JSON with no line breaks) is cut between words.
// A dense list ends a part sooner, after about 35 lines with an address, a
// handle or a phone number in them, so the answer fits its 4,096 tokens; a
// part ends at a blank line where it can, so a lead's lines stay together.
const PART = 6_000;
const PART_LEADS = 35;
const REACH_LINE = /@|\+?\d[\d\s().-]{6,}\d/;
export function partsOf({ text, images }: { text: string; images: string[] }): Part[] {
  const parts: Part[] = [];
  let chunk = "";
  let reach = 0;
  const flush = (cut = chunk.length) => {
    if (chunk.slice(0, cut).trim()) parts.push({ text: chunk.slice(0, cut) });
    chunk = chunk.slice(cut);
    reach = chunk.split("\n").filter((l) => REACH_LINE.test(l)).length;
  };
  for (const line of text.split("\n").flatMap((l) => l.match(new RegExp(`.{1,${PART}}(?:\\s+|$)|.{1,${PART}}`, "gs")) ?? [""])) {
    const hit = REACH_LINE.test(line);
    if (chunk.length + line.length > PART || (hit && reach >= PART_LEADS)) {
      const blank = chunk.lastIndexOf("\n\n");
      flush(blank > chunk.length / 2 ? blank + 1 : undefined);
      if (chunk.length + line.length > PART) flush();
    }
    chunk += `${line}\n`;
    if (hit) reach++;
  }
  flush();
  let group: string[] = [];
  for (const img of images) {
    if (group.length === 2 || group.reduce((n, g) => n + g.length, 0) + img.length > 3_000_000) {
      parts.push({ images: group });
      group = [];
    }
    group.push(img);
  }
  if (group.length) parts.push({ images: group });
  return parts;
}
// A part cut in two, when Claude's answer to it ran out of room: at a blank
// line past the middle, else a line break, else a space (a page with no breaks)
export function halves(part: Part): [Part, Part] | null {
  if (part.images && part.images.length > 1) {
    const mid = Math.ceil(part.images.length / 2);
    return [{ images: part.images.slice(0, mid) }, { images: part.images.slice(mid) }];
  }
  const text = (part.text ?? "").trimEnd();
  const half = text.length / 2;
  let mid = text.indexOf("\n\n", half);
  if (mid < 0 || mid > half * 1.5) mid = text.indexOf("\n", half);
  if (mid < 0) mid = text.lastIndexOf(" ", half);
  return mid > 0 && mid < text.length - 1 ? [{ text: text.slice(0, mid) }, { text: text.slice(mid + 1) }] : null;
}

// ---- Reading a file (browser only, but for the pure parts) ----

// A text file's words: UTF-8, UTF-16 by its mark (Excel's "Unicode Text"),
// else Windows-1252 (Excel's plain "CSV (Comma delimited)" on Windows)
export function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// A JSON file's records, or JSON Lines' (a record a line)
export function jsonFileRows(text: string): Row[] {
  try {
    return jsonRows(JSON.parse(text));
  } catch {}
  try {
    return jsonRows(
      text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l)),
    );
  } catch {
    return [];
  }
}

// A sheet pasted as text (a tab between its cells, or " | ") or a Markdown
// table with nothing beside it to reach anyone by, as rows; null for any
// other text (notes, an email, "Name:<tab>Jane" lines), which Claude reads
export function textRows(text: string): Row[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines.findIndex((l, i) => i > 0 && /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/.test(l) && lines[i - 1].includes("|"));
  if (sep > 0) {
    let end = sep + 1;
    while (end < lines.length && lines[end].includes("|")) end++;
    if ([...lines.slice(0, sep - 1), ...lines.slice(end)].some((l) => reaches(l) || REACH_LINE.test(l))) return null;
    return tableRows([lines[sep - 1], ...lines.slice(sep + 1, end)].map((l) => l.trim().replace(/^\||\|$/g, "").split("|")));
  }
  for (const [d, least] of [["\t", 1], ["|", 2]] as const) {
    const n = (lines[0] ?? "").split(d).length - 1;
    const same = lines.filter((l) => l.split(d).length - 1 === n).length;
    if (n >= least && lines.length > 1 && same >= lines.length * 0.8 && !reaches(lines[0]) && !lines[0].split(d).some((c) => c.trim().endsWith(":"))) return tableRows(parseCsv(text, d));
  }
  return null;
}

const xmlOf = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const all = (n: Document | Element, tag: string) => [...n.getElementsByTagNameNS("*", tag)];
// where a part's links point, by their ids (a sheet's or a document's .rels)
const relsOf = (xml?: string) => new Map(xml ? all(xmlOf(xml), "Relationship").map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]) : []);
// a link's address: a Google redirect's own, an email's without mailto: and its ?subject
const linkTarget = (href: string) => {
  const q = /^https?:\/\/(?:www\.)?google\.com\/url\?(?:.*&)?q=([^&]+)/i.exec(href)?.[1];
  return q ? decodeURIComponent(q) : href.replace(/^mailto:/i, "").split("?")[0];
};

// One sheet as a grid: a merged range's value in each of its cells (a clinic
// written once beside its three people), a linked cell's address where its
// words don't say ("Instagram")
function sheetGrid(xml: string, shared: string[], links: Map<string, string>): string[][] {
  const sheet = xmlOf(xml);
  const at = (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref) ?? ["", "A", "1"];
    return [Number(m[2]) - 1, [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1];
  };
  const grid: string[][] = [];
  all(sheet, "row").forEach((row, i) => {
    const r = Number(row.getAttribute("r")) - 1;
    const cells = (grid[r >= 0 ? r : i] ??= []);
    for (const c of all(row, "c")) {
      const ref = c.getAttribute("r");
      const v = all(c, "v")[0]?.textContent ?? "";
      const type = c.getAttribute("t");
      cells[ref ? at(ref)[1] : cells.length] =
        type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? all(c, "t").map((t) => t.textContent ?? "").join("") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
    }
  });
  for (const h of all(sheet, "hyperlink")) {
    const target = links.get(h.getAttribute("r:id") ?? "");
    const [r, c] = at((h.getAttribute("ref") ?? "").split(":")[0]);
    if (target && !reaches(grid[r]?.[c] ?? "")) (grid[r] ??= [])[c] = linkTarget(target);
  }
  for (const m of all(sheet, "mergeCell")) {
    const [a, b = a] = (m.getAttribute("ref") ?? "").split(":");
    const [r0, c0] = at(a);
    const [r1, c1] = at(b);
    const v = grid[r0]?.[c0] ?? "";
    for (let r = r0; r <= Math.min(r1, r0 + 10_000); r++) for (let c = c0; c <= Math.min(c1, c0 + 200); c++) (grid[r] ??= [])[c] = v;
  }
  return Array.from(grid, (r) => Array.from(r ?? [], (x) => x ?? ""));
}
// A workbook's rows: every sheet, the ones laid out alike together, and of
// those the ones with the most filled in (not a README or a summary first)
function xlsxRows(files: Record<string, string>): Row[] {
  const shared = files["xl/sharedStrings.xml"] ? all(xmlOf(files["xl/sharedStrings.xml"]), "si").map((si) => all(si, "t").map((t) => t.textContent ?? "").join("")) : [];
  const groups = new Map<string, Row[]>();
  const sheets = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const name of sheets) {
    const rows = tableRows(sheetGrid(files[name], shared, relsOf(files[name.replace(/([^/]+)$/, "_rels/$1.rels")])));
    const key = Object.keys(rows[0] ?? {}).join("\n");
    if (rows.length) groups.set(key, [...(groups.get(key) ?? []), ...rows]);
  }
  const size = (rows: Row[]) => rows.reduce((n, r) => n + Object.values(r).filter((v) => v !== "").length, 0);
  return [...groups.values()].reduce((a, b) => (size(b) > size(a) ? b : a), [] as Row[]);
}

// A Word document's words, paragraph by paragraph: a table's rows as lines
// with a tab between cells, a link's address after its words, a text box
// once (not again as its copy for old Word). One table and nothing else to
// reach anyone by is rows, which code places; anything else is words (and
// the pictures in it) for Claude.
function readDocx(files: Record<string, string>, images: string[]): Read {
  const doc = xmlOf(files["word/document.xml"] ?? "<w/>");
  all(doc, "Fallback").forEach((e) => e.remove());
  const links = relsOf(files["word/_rels/document.xml.rels"]);
  const textOf = (e: Element): string =>
    [...e.children]
      .map((x) => {
        if (["p", "instrText", "delText"].includes(x.localName)) return "";
        if (x.localName === "t") return x.textContent ?? "";
        if (x.localName === "tab") return "\t";
        if (x.localName === "br" || x.localName === "cr") return "\n";
        const words = textOf(x);
        const to = x.localName === "hyperlink" ? linkTarget(links.get(x.getAttribute("r:id") ?? "") ?? "") : "";
        return to && !words.includes(to) ? `${words} (${to})` : words;
      })
      .join("");
  const lines: string[] = [];
  const loose: string[] = [];
  const grid: string[][] = [];
  const walk = (e: Element) => {
    for (const x of e.children) {
      if (x.localName === "tbl")
        for (const tr of all(x, "tr")) {
          const cells = [...tr.children].filter((c) => c.localName === "tc").map((tc) => all(tc, "p").map(textOf).join(" ").replace(/\s+/g, " ").trim());
          grid.push(cells);
          lines.push(cells.join("\t"));
        }
      else if (x.localName === "p") {
        const t = textOf(x);
        lines.push(t);
        loose.push(t);
        walk(x);
      } else walk(x);
    }
  };
  walk(doc.documentElement);
  if (all(doc, "tbl").length === 1 && !images.length && !loose.some((l) => reaches(l) || REACH_LINE.test(l))) return { rows: tableRows(grid) };
  return { text: lines.join("\n"), images };
}

// A table as a grid: a cell spanning rows or columns in each of them, a cell
// that's one link as its address when its words don't say ("Instagram",
// "Email her"), a two-row heading as one ("Contact" over "Name" is "Contact
// Name"), and a Google Sheets download's A, B, C row and row numbers left out
// A cell's words with their line breaks (a <br>, a paragraph's end) kept, as
// a CSV's quoted cell keeps them, so a message in a table comes in with its
// paragraphs; spaces run together, a blank line at most
export const cellText = (t: string) =>
  t
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
function gridOf(t: HTMLTableElement): string[][] {
  const cell = (td: HTMLTableCellElement) => {
    const text = cellText(td.textContent ?? "");
    const a = td.querySelectorAll("a[href]");
    const href = a.length === 1 ? (a[0].getAttribute("href") ?? "") : "";
    return /^(https?:|mailto:)/i.test(href) && !reaches(text) ? linkTarget(href) : text;
  };
  const grid: string[][] = [];
  [...t.rows].forEach((tr, r) => {
    let c = 0;
    for (const td of tr.cells) {
      while (grid[r]?.[c] !== undefined) c++;
      const text = cell(td);
      for (let i = 0; i < Math.min(Math.max(1, td.rowSpan), t.rows.length - r); i++) for (let j = 0; j < Math.max(1, td.colSpan); j++) (grid[r + i] ??= [])[c + j] = text;
      c += Math.max(1, td.colSpan);
    }
  });
  const rows = Array.from(grid, (row) => Array.from(row ?? [], (x) => x ?? ""));
  const letters = (r: string[]) => (r[0] ? r : r.slice(1)).every((x, i, s) => s.length > 1 && x === String.fromCharCode(65 + i));
  if (rows[0] && letters(rows[0])) rows.shift();
  const [h0, h1] = [...t.rows];
  if (h1 && rows.length > 1 && [...h0.cells].some((c) => c.colSpan > 1) && [...h1.cells].every((c) => c.tagName === "TH")) {
    rows[0] = rows[0].map((a, i) => (!rows[1][i] || a === rows[1][i] ? a : a ? `${a} ${rows[1][i]}` : rows[1][i]));
    rows.splice(1, 1);
  }
  return rows;
}

// A page's JSON blocks or its tables (the ones laid out like the biggest,
// together: a table per country), whichever holds the most rows, else its
// words. A break or the end of a block is a line break, so the words of
// neighbouring elements never run together ("Jane Doejane@clinic.com").
function readHtml(html: string): Read {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, th.row-headers-background, th.row-header").forEach((e) => e.remove());
  doc.querySelectorAll("br").forEach((e) => e.replaceWith("\n"));
  doc.querySelectorAll("address, article, aside, blockquote, dd, div, dt, footer, h1, h2, h3, h4, h5, h6, header, li, p, pre, section, td, th, tr").forEach((e) => e.append("\n"));
  const tables = [...doc.querySelectorAll("table")].map((t) => tableRows(gridOf(t)));
  const keys = (rows: Row[]) => Object.keys(rows[0] ?? {}).join("\n");
  const biggest = tables.reduce((a, b) => (b.length > a.length ? b : a), [] as Row[]);
  const joined = tables.filter((t) => t.length && keys(t) === keys(biggest)).flat();
  const script = htmlScriptRows(html);
  const rows = script.length >= joined.length ? script : joined;
  if (rows.length) return { rows };
  return { text: doc.body?.textContent?.replace(/\n\s*\n+/g, "\n").trim() ?? "", images: [] };
}

// Where a picture is cut so Claude can read it: a tall one (a scrolling
// screenshot) in slices at most twice as tall as they're wide, overlapping a
// little so no line is lost between two (a lead in both is one, buildLeads)
export function slices(width: number, height: number): { top: number; height: number }[] {
  if (!width || !height) return [];
  const h = Math.min(height, width * 2);
  const out: { top: number; height: number }[] = [];
  for (let top = 0; ; top += Math.max(1, Math.round(h * 0.92))) {
    out.push({ top: Math.min(top, height - h), height: h });
    if (top + h >= height) return out;
  }
}
// ...each as a JPEG at most 1,568 px on its long side, what Claude reads best
function jpegs(src: CanvasImageSource, width: number, height: number): string[] {
  return slices(width, height).map(({ top, height: h }) => {
    const scale = Math.min(1, 1568 / Math.max(width, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d")!;
    // JPEG has no transparency: see-through parts go white, not black
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, top, width, h, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  });
}
async function pictureOf(file: Blob): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Unreadable("This browser can't open that picture. Save it as JPEG or PNG, then import that.");
    });
    const out = jpegs(img, img.naturalWidth, img.naturalHeight);
    if (out.length > MAX_SCANS) throw new Unreadable("That picture is too long to read in one go. Split it into smaller ones.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A PDF's words, page by page, with where its links point; a page that's a
// picture (next to no words and a picture, or a screenshot pasted in beside
// a few lines) is sent as one. A picture the same size on several pages is a
// letterhead, not a list. A short page without one keeps its words, and a
// blank page adds nothing.
// ponytail: a page full of words with a screenshot in it keeps only its words; send both if one turns up
async function readPdf(file: File): Promise<Read> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pictures = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageXObjectRepeat]);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const words = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("");
    const urls = (await page.getAnnotations()).filter((a) => a.subtype === "Link" && a.url).map((a) => linkTarget(String(a.url)));
    const ops = await page.getOperatorList();
    const shots = ops.fnArray.flatMap((op, i) => (op === pdfjs.OPS.paintImageXObject && ops.argsArray[i][1] >= 400 && ops.argsArray[i][2] >= 150 ? [`${ops.argsArray[i][1]}x${ops.argsArray[i][2]}`] : []));
    pages.push({ page, words: urls.length ? `${words}\n${urls.join(" ")}` : words, pictured: ops.fnArray.some((op) => pictures.has(op)), shots });
  }
  const sizes = pages.flatMap((p) => [...new Set(p.shots)]);
  let text = "";
  const images: string[] = [];
  for (const { page, words, pictured, shots } of pages) {
    const scan = (words.trim().length < 100 && pictured) || (words.length < 1_500 && shots.some((s) => sizes.filter((x) => x === s).length === 1));
    if (!scan) {
      if (words.trim()) text += `${words}\n`;
      continue;
    }
    const fit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1568 / Math.max(fit.width, Math.min(fit.height, fit.width * 2)) });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    images.push(...jpegs(canvas, canvas.width, canvas.height));
    if (images.length > MAX_SCANS) throw new Unreadable(`That PDF has more than ${MAX_SCANS} scanned pages. Split it into smaller files.`);
  }
  return { text, images };
}

export async function readFile(file: File): Promise<Read> {
  const kind = KIND[extOf(file.name)];
  let read: Read;
  if (kind === "image") read = { text: "", images: await pictureOf(file) };
  else if (kind === "pdf") read = await readPdf(file);
  else if (kind === "xlsx" || kind === "docx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => /^(xl\/(sharedStrings\.xml|worksheets\/([^/]+\.xml|_rels\/[^/]+\.rels))|word\/(document\.xml|_rels\/document\.xml\.rels|media\/[^/]+\.(png|jpe?g|gif|webp)))$/i.test(f.name),
    });
    const media = Object.entries(zip).filter(([n]) => n.startsWith("word/media/"));
    const files = Object.fromEntries(Object.entries(zip).filter(([n]) => !n.startsWith("word/media/")).map(([n, b]) => [n, strFromU8(b)]));
    if (kind === "xlsx") read = { rows: xlsxRows(files) };
    else {
      // the pictures pasted in (a screenshot of a list), not its icons
      const images: string[] = [];
      for (const [, b] of media) if (b.length > 20_000) images.push(...(await pictureOf(new Blob([b.slice()]))));
      if (images.length > MAX_SCANS) throw new Unreadable(`That document has more than ${MAX_SCANS} pictures in it. Split it into smaller files.`);
      read = readDocx(files, images);
    }
  } else {
    const text = decode(new Uint8Array(await file.arrayBuffer()));
    if (kind === "csv" || kind === "tsv") read = { rows: tableRows(parseCsv(text, kind === "tsv" ? "\t" : undefined)) };
    else if (kind === "html") read = readHtml(text);
    else {
      const rows = kind === "json" ? jsonFileRows(text) : textRows(text);
      read = rows?.length ? { rows } : { text, images: [] };
    }
  }
  if ("rows" in read ? !read.rows.length : !read.text.trim() && !read.images.length) throw new Unreadable("There are no leads in that file to import.");
  if ("text" in read && read.text.length > MAX_TEXT) throw new Unreadable("That's too much text to read in one go. Split it into smaller files.");
  return read;
}
