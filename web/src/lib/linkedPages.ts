import { prisma } from "./prisma.ts";
import { boardCountry, tagFor } from "./channelCountry.ts";
import { isGreeting } from "./leadImport.ts";
import { cleanValue, COLOR_NAMES, type ChannelKind, type Contact, type LinkValue } from "./space.ts";

// A lead's contact details from the public Notion page(s) in its Links
// (Abhishek, 23 Oct 2026): the Dream 300 file has no emails or handles, its
// doctors' Notion pages do ("Email ID 1: …", "LinkedIn Profile: …",
// "Instagram Link: …"), read with no token as the page's own site reads them.
// Only added, never replacing: emails and handles the lead lacks, a name for a
// contact without one (or a fuller one), Country while empty. Everyone on a
// page is a possible contact (Abhishek's call, 23 Oct 2026: find every
// possible contact): staff under their own heading ("CEO:", "Medical
// Director:") and doctors named in the label ("Email ID of Dr. Luke Maxfield")
// are each their own contact, with their role; the clinic's accounts
// ("Clinic's IG", the brand's website) only when nobody on the lead has an
// Instagram otherwise.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const AT_ONCE = 4;
const FETCH_MS = 8_000;
// no new read starts after this; one read in flight can add FETCH_MS, so the whole stays under 45 s
const BUDGET_MS = 34_000;

export type Details = { emails: string[]; linkedin: string[]; instagram: string[]; youtube: string[]; x: string[]; tiktok: string[]; phones: string[]; websites: string[] };
export type Other = Details & { role: string; name?: string };
// site: a website's or a channel's own details (lib/leadLinks), the owner's,
// so only the kinds nobody on the lead has yet; clinic: the clinic's accounts
// text: the page's words, as read
export type NotionPage = Details & { name?: string; country?: string; others: Other[]; clinic: { instagram: string[]; websites: string[] }; site?: boolean; text?: string };

// ---- Addresses, as the app keeps them ----

const IG_NOT_PROFILE = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about"]);
export function instagramUrl(raw: string): string | null {
  const h = /^(?:https?:\/\/)?(?:[\w-]+\.)*instagram\.com\/([A-Za-z0-9._]+)/i.exec(raw.trim())?.[1]?.toLowerCase();
  return h && !IG_NOT_PROFILE.has(h) ? `https://www.instagram.com/${h}/` : null;
}
export function linkedinUrl(raw: string): string | null {
  const slug = /^(?:https?:\/\/)?(?:[\w-]+\.)*linkedin\.com\/in\/([^/?#\s<>]+)/i.exec(raw.trim())?.[1];
  return slug ? `https://www.linkedin.com/in/${slug}/` : null;
}
export function youtubeUrl(raw: string): string | null {
  const path = /^(?:https?:\/\/)?(?:[\w-]+\.)*youtube\.com\/(@[^/?#\s<>]+|(?:channel|c|user)\/[^/?#\s<>]+)/i.exec(raw.trim())?.[1];
  return path ? `https://www.youtube.com/${path}` : null;
}
const X_NOT_PROFILE = new Set(["intent", "share", "home", "hashtag", "search", "i", "explore", "login", "signup", "settings", "privacy", "tos", "messages", "notifications"]);
export function xUrl(raw: string): string | null {
  const h = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?=[/?#]|$)/i.exec(raw.trim())?.[1]?.toLowerCase();
  return h && !X_NOT_PROFILE.has(h) ? `https://x.com/${h}` : null;
}
// a TikTok profile, never one of its videos
export function tiktokUrl(raw: string): string | null {
  const h = /^(?:https?:\/\/)?(?:[\w-]+\.)*tiktok\.com\/@([\w.-]{2,24})\/?(?:[?#].*)?$/i.exec(raw.trim())?.[1]?.toLowerCase();
  return h ? `https://www.tiktok.com/@${h}` : null;
}
// the platforms' own accounts, and site builders' left in a template's footer
const OWN = /\/(@?(instagram|linkedin|youtube|twitter|x|tiktok|wix|squarespace|godaddy|shopify|wordpress|webflow|elementor))\/?$/i;
// A link's profile onto the list for its platform, if it's one
export function profileInto(d: Details, raw: string) {
  for (const [key, of] of [
    ["instagram", instagramUrl],
    ["linkedin", linkedinUrl],
    ["youtube", youtubeUrl],
    ["x", xUrl],
    ["tiktok", tiktokUrl],
  ] as const) {
    const u = of(raw);
    if (u && !OWN.test(u)) add(d[key], u);
  }
}
const SOCIAL = /(^|\.)(instagram|linkedin|youtube|youtu|facebook|tiktok|twitter|x|notion)\.(com|be|so|site)$/i;
function websiteUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) && !SOCIAL.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

// ---- One page's text, into people ----

// every part bounded, and starting where an address can, so a page of
// letters with no "@" is read in one pass, not one per letter (lib/leadLinks too)
export const EMAIL = /(?<![A-Za-z0-9._%+'-])[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
const URLS = /(?<![\w.-])(?:https?:\/\/)?(?:[\w-]+\.)*(?:instagram|linkedin|youtube)\.com\/[^\s<>()"']+|https?:\/\/[^\s<>()"']+/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
// "Label: value", the colon not a link's ("https://…")
const LABEL = /^([^:\n]{1,60}?)\s*:(?!\/\/)\s*(.*)$/;
// the outreach drafts written on the page, not details
const COPY = /copy|subject|^(instagram|linkedin|ig|email)\s*dm$/i;
const CHANNEL = /e-?mail|linked\s*in|insta|\big\b|\byt\b|you\s*tube|web|site|phone|whats\s*app|mobile|\btel\b|link|page|profile|tik\s*tok|facebook|twitter/i;
// someone else's account: the clinic's, a brand's, a nurse's, an app's
const NOT_THEIRS = /clinic|brand|other|nurse|podcast|academy|\bapp\b|business|account|common|company|course|page 2/i;
// ...of those, the clinic's own (its Instagram, its website)
const CLINIC = /clinic|brand|business|company|practice/i;
const WEBSITE = /web|site/i;
const PHONE_LABEL = /phone|whats\s*app|mobile|\btel\b/i;
const NAMED = /\s(?:of|by)?\s*(dr[.,]?\s+[a-z][\w.'-]*(?:\s+[a-z][\w.'-]*)*)$/i;

const TITLES = new Set(["dr", "doctor", "md", "do", "facs", "phd", "mbbs", "frcs", "prof", "mr", "mrs", "ms"]);
const words = (name = "") => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w && !TITLES.has(w));
// one name's words all in the other's ("Dr. Ross" and "Dr. Ross Kopelman")
export function samePerson(a = "", b = ""): boolean {
  const x = words(a);
  const y = words(b);
  return x.length > 0 && y.length > 0 && (x.every((w) => y.includes(w)) || y.every((w) => x.includes(w)));
}

export const emptyDetails = (): Details => ({ emails: [], linkedin: [], instagram: [], youtube: [], x: [], tiktok: [], phones: [], websites: [] });
const empty = emptyDetails;
const add = (list: string[], v: string | null) => {
  if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
};

// A page's properties ({ Name, Country }) and text lines, into its doctor and
// anyone else on it
export function detailsOf(props: Record<string, string>, lines: string[]): NotionPage {
  const main = empty();
  const others: Other[] = [];
  const clinic = { instagram: [] as string[], websites: [] as string[] };
  const mailed = new Set<Details>();
  const name = props.Name?.normalize("NFKC").replace(/\s*<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
  const country = props.Country?.trim() || undefined;
  // whose details these are now, and the label (and person) a line without one goes on
  let who: Details = main;
  let last: { label: string; to: Details } | null = null;

  const take = (p: Details, label: string, value: string) => {
    last = { label, to: p };
    if (!NOT_THEIRS.test(label)) {
      for (const e of value.match(EMAIL) ?? []) add(p.emails, e.toLowerCase());
      for (const u of value.match(URLS) ?? []) profileInto(p, u);
      if (PHONE_LABEL.test(label)) for (const n of value.match(PHONE) ?? []) add(p.phones, n.replace(/\s+/g, " "));
    } else if (CLINIC.test(label)) for (const u of value.match(URLS) ?? []) add(clinic.instagram, instagramUrl(u));
    // a website: theirs, the clinic's, or someone else's (left out)
    const sites = !WEBSITE.test(label) ? null : CLINIC.test(label) ? clinic.websites : NOT_THEIRS.test(label) ? null : p.websites;
    if (sites) for (const u of value.match(/https?:\/\/[^\s<>()"']+/gi) ?? []) add(sites, websiteUrl(u));
  };
  const another = (role: string) => {
    const o: Other = { ...empty(), role };
    others.push(o);
    return o;
  };
  const named = (n: string) => {
    const clean = n.replace(/^dr[.,]?\s+/i, "Dr. ").trim();
    let o = others.find((x) => x.name && samePerson(x.name, clean));
    if (!o) (o = another("")).name = clean;
    else if (clean.length > o.name!.length) o.name = clean;
    return o;
  };

  for (const block of lines) {
    const subs = block.normalize("NFKC").split("\n");
    for (const sub of subs) {
      const m = LABEL.exec(sub.trim());
      if (!m) {
        // more of the last label's value (a second Instagram under it)
        if (last && sub.trim()) take(last.to, last.label, sub);
        continue;
      }
      const [, label, value] = m;
      const person = NAMED.exec(label)?.[1];
      if (COPY.test(label)) last = { label, to: empty() };
      else if (person) take(named(person), label, value);
      else if (CHANNEL.test(label)) {
        // the same labels again with no heading of their own: someone else
        if (/^e-?mail/i.test(label) && !NOT_THEIRS.test(label)) {
          if (mailed.has(who)) who = another("");
          mailed.add(who);
        }
        take(who, label, value);
      } else if (subs.length === 1 && !NOT_THEIRS.test(label) && !value.trim() && /^[\p{L}\p{N}/&' -]+$/u.test(label) && label.split(" ").length <= 4) {
        // "CEO:" on a line of its own heads that person's details
        who = another(label);
        last = null;
      } else if (subs.length === 1 && !NOT_THEIRS.test(label) && value.trim()) {
        // "Manager: sara@…": theirs alone
        take(another(label.slice(0, 60)), "", value);
        last = null;
      } else last = null;
    }
  }
  return {
    ...(name && { name }),
    ...(country && { country }),
    ...main,
    // a person: named, or reachable by email or LinkedIn
    others: others.filter((o) => (o.name || o.emails.length || o.linkedin.length) && KINDS.some(([key]) => o[key].length)),
    clinic,
  };
}

// ---- Reading a page ----

// the site and page a Notion link points at
export function notionPageOf(url: string): { origin: string; id: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || u.port || !/(^|\.)notion\.(so|site)$/i.test(u.hostname)) return null;
    const hex = /([0-9a-f]{32})\/?$/i.exec(u.pathname.replace(/-/g, ""))?.[1]?.toLowerCase();
    if (!hex) return null;
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { origin: /notion\.site$/i.test(u.hostname) ? u.origin : "https://www.notion.so", id };
  } catch {
    return null;
  }
}

type Rec = Record<string, unknown>;
// a record's own fields (the page's data nests them as value.value)
const valueOf = (x: unknown): Rec | undefined => {
  const v = (x as Rec | undefined)?.value as Rec | undefined;
  return v && typeof v.value === "object" && v.value ? (v.value as Rec) : v;
};
// Notion's rich text, a link's address kept when its words aren't it
const textOf = (rich: unknown): string =>
  Array.isArray(rich)
    ? rich
        .map((seg) => {
          if (!Array.isArray(seg) || typeof seg[0] !== "string") return "";
          let t = seg[0];
          for (const f of Array.isArray(seg[1]) ? seg[1] : []) if (Array.isArray(f) && f[0] === "a" && typeof f[1] === "string" && !t.includes(f[1])) t += ` <${f[1]}>`;
          return t;
        })
        .join("")
    : "";

// a loadPageChunk answer, into the page's properties by name and its lines
export function pageOf(recordMap: unknown, id: string): { props: Record<string, string>; lines: string[] } | null {
  const blocks = ((recordMap as Rec | undefined)?.block ?? {}) as Rec;
  const page = valueOf(blocks[id]);
  if (!page) return null;
  const collections = Object.values(((recordMap as Rec).collection ?? {}) as Rec).map(valueOf);
  const schema = ((collections.find((c) => c?.id === page.parent_id) ?? collections.find((c) => c?.schema))?.schema ?? {}) as Record<string, { name?: string }>;
  const props = Object.fromEntries(Object.entries((page.properties ?? {}) as Rec).map(([k, v]) => [schema[k]?.name ?? (k === "title" ? "Name" : k), textOf(v)]));
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (ids: unknown, depth: number) => {
    for (const bid of Array.isArray(ids) ? ids : []) {
      if (typeof bid !== "string" || seen.has(bid)) continue;
      seen.add(bid);
      const b = valueOf(blocks[bid]);
      if (!b) continue;
      const t = textOf((b.properties as Rec | undefined)?.title).trim();
      if (t) lines.push(t);
      if (depth < 8) walk(b.content, depth + 1);
    }
  };
  walk(page.content, 0);
  return { props, lines };
}

// Notion's API rich text, a link's address kept when its words aren't it
const apiText = (rich: unknown): string =>
  Array.isArray(rich) ? rich.map((r: { plain_text?: string; href?: string | null }) => `${r.plain_text ?? ""}${r.href && !(r.plain_text ?? "").includes(r.href) ? ` <${r.href}>` : ""}`).join("") : "";
// a property's words, whatever its kind
const apiProp = (p: Rec): string => {
  const v = p[p.type as string];
  if (Array.isArray(v)) return p.type === "multi_select" ? v.map((o: { name?: string }) => o.name ?? "").join(", ") : apiText(v);
  return typeof v === "string" ? v : typeof (v as Rec | null)?.name === "string" ? ((v as Rec).name as string) : "";
};

// A notion.so page that isn't public but is shared with the app's Notion
// connection (NOTION_TOKEN), through Notion's API: its properties, and its
// blocks' words a few levels into toggles and columns (ten calls at most)
async function apiPage(id: string): Promise<{ props: Record<string, string>; lines: string[] }> {
  const { notionGet } = await import("./notion.ts");
  const page = await notionGet(`/pages/${id}`);
  const props = Object.fromEntries(Object.entries((page.properties ?? {}) as Record<string, Rec>).map(([k, p]) => [p.type === "title" ? "Name" : k, apiProp(p)]));
  const lines: string[] = [];
  let calls = 0;
  const walk = async (bid: string, depth: number) => {
    let cursor: string | undefined;
    do {
      if (++calls > 10) return;
      const r = await notionGet(`/blocks/${bid}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
      for (const b of (r.results ?? []) as Rec[]) {
        const t = apiText(((b[b.type as string] ?? {}) as Rec).rich_text).trim();
        if (t) lines.push(t);
        if (b.has_children && depth < 3) await walk(String(b.id), depth + 1);
      }
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
  };
  await walk(id, 0);
  return { props, lines };
}

// an answer that may be different in a moment: too many reads, or the server's trouble
export const busy = (status: number) => status === 429 || status >= 500;
// rejects when the time is up, for what can't be handed a signal
const timedOut = (signal: AbortSignal) => new Promise<never>((_, no) => signal.addEventListener("abort", () => no(signal.reason), { once: true }));

// One Notion page, read and parsed: the public page, else (a notion.so page
// that isn't public) through the app's Notion connection, only when `shared`
// says the reader may: it sees the team's own pages too (the workbook, the
// clients' records), so only Level 1's imports use it (importActions
// findContacts). Null when it can't be read; running out of time, or Notion
// busy (429, 5xx) or out of reach, throws, so a caller can try again later.
export async function loadNotion(url: string, ms = FETCH_MS, shared = false): Promise<NotionPage | null> {
  const at = notionPageOf(url);
  if (!at) return null;
  const signal = AbortSignal.timeout(ms);
  const late = (e: unknown) => {
    if (signal.aborted) throw e;
    return null;
  };
  const pub = await fetch(`${at.origin}/api/v3/loadPageChunk`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ pageId: at.id, limit: 100, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false }),
    signal,
  }).then(async (res) => {
    if (busy(res.status)) throw new Error(`Notion answered ${res.status}`);
    return res.ok ? pageOf(((await res.json().catch(late)) as Rec | null)?.recordMap, at.id) : null;
  });
  const read = (p: { props: Record<string, string>; lines: string[] }) => ({ ...detailsOf(p.props, p.lines), text: p.lines.join("\n") });
  if (pub) return read(pub);
  if (!shared || at.origin !== "https://www.notion.so" || !process.env.NOTION_TOKEN) return null;
  const api = await Promise.race([apiPage(at.id), timedOut(signal)]).catch(late);
  return api ? read(api) : null;
}
// ...null however it fails
export const readNotionPage = (url: string, ms = FETCH_MS): Promise<NotionPage | null> => loadNotion(url, ms).catch(() => null);

// ---- Onto a lead ----

const norm = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
const keyOf = (kind: ChannelKind, v: string) =>
  `${kind}:${norm((kind === "instagram" ? instagramUrl(v.trim().replace(/^@/, "instagram.com/")) : kind === "linkedin" ? linkedinUrl(v) : kind === "youtube" ? youtubeUrl(v) : kind === "x" ? xUrl(v) : null) ?? v)}`;
const KINDS: [keyof Details, ChannelKind][] = [
  ["emails", "email"],
  ["linkedin", "linkedin"],
  ["instagram", "instagram"],
  ["youtube", "youtube"],
  ["x", "x"],
  ["tiktok", "other"],
  ["phones", "phone"],
  ["websites", "other"],
];
// what a lead's messages can go to
const REACH: ChannelKind[] = ["email", "instagram", "linkedin"];
// which of a page's lists a contact's channel is (a TikTok and a website are both "other")
const listOf = (ch: Contact["channels"][number]): keyof Details =>
  ch.kind === "other" ? (tiktokUrl(ch.value) ? "tiktok" : "websites") : KINDS.find(([, kind]) => kind === ch.kind)![0];

// The people in one name: "Dr Shah & Dr Maxfield", "Dr. Muneeb Shah and Dr.
// Luke Maxfield", joined by &, and, /, + (or commas between doctors, or only
// a space before the next one's title: "Dr. Ross Kopelman Dr. Joel
// Kopelman"), each part a person (a title, or two to four words that aren't a
// practice's), so "VIVIFY plastic surgery & medspa" is no one's
const PRACTICE = /clinic|surgery|cent(er|re)|medical|med\s?spa|spa\b|aesthetic|derm|skin|health|institute|cosmetic|wellness|group|hair|plastic|laser|beauty/i;
const DOCTOR = /^(dr|doctor|prof)\b\.?/i;
export function namesIn(name = ""): string[] {
  const isPerson = (p: string) => DOCTOR.test(p) || (words(p).length >= 2 && words(p).length <= 4 && !PRACTICE.test(p));
  const parts = name
    .split(/\s*(?:&|\+|\/|\band\b)\s*|,?\s+(?=(?:dr|doctor|prof)\b\.?\s)/i)
    .flatMap((p) => (p.split(/\s*,\s*/).every((x) => DOCTOR.test(x)) ? p.split(/\s*,\s*/) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every(isPerson) ? parts : [];
}
// a person's name, not a business's or a channel's: a title, people named
// together, or two to four words none of them a practice's ("Jonathan Zelken",
// not "Doctorly" or "The Skin Center")
const personal = (name = "") => DOCTOR.test(name.trim()) || namesIn(name).length > 0 || (/^\S+(\s+\S+){1,3}$/.test(name.trim()) && !PRACTICE.test(name));
// a name up to its credentials or brand: "Robert Najera, M.D. - Dr. Dallas" is Robert Najera
const firstPart = (name: string) => name.split(/\s+[-–—|]\s+|\s*[|,]\s*/)[0].trim();

// "linkedin.com/in/byron-poindexter-50831721" is Byron Poindexter: the
// address's words up to its letters or id; one run together ("robertsigal")
// names no one
export function linkedinName(url = ""): string {
  const slug = /linkedin\.com\/in\/([^/?#\s]+)/i.exec(url)?.[1];
  let parts: string[];
  try {
    parts = slug ? decodeURIComponent(slug).split(/[-_]+/) : [];
  } catch {
    return "";
  }
  if (DOCTOR.test(parts[0] ?? "")) parts.shift();
  const end = parts.findIndex((p) => /\d/.test(p) || TITLES.has(p.toLowerCase()));
  const name = end < 0 ? parts : parts.slice(0, end);
  while (name.length && name[name.length - 1].length < 2) name.pop();
  return name.length >= 2 && name.every((p) => /^\p{L}[\p{L}'.]*$/u.test(p)) ? name.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ") : "";
}

// A lead's contacts with its pages' details added. A page's own details go
// onto the one contact its name is (or one holding an address of the page's),
// else the first; every other person on it onto the one contact their name
// is (or an address), else as their own contact with their role (named from
// their LinkedIn when the page doesn't say). A name two contacts share
// ("Dr. Kopelman", with Dr. Ross and Dr. Joel Kopelman) is neither's, unless
// an address or its LinkedIn says whose. The lead's one contact naming the
// page's people together ("Dr Shah & Dr Maxfield"), with nothing of its own,
// gives way to them. A contact without a name, or with a greeting for one
// ("there"), takes the page's, and a shorter form of it ("Dr Kim") the fuller
// one (only its person's part). Then the sites' and channels' details (site),
// the owner's, onto the contact without a role (staff have theirs), else one
// named after the lead, for the kinds nobody has yet (three emails at most);
// then the clinic's Instagram, when nobody has one, on the lead's own
// business-named contact, else one of its own (role Clinic, never a person's
// name). Nothing already on the lead (or a YouTube channel in its Links)
// twice; 50 contacts at most; no contact left that's only the lead's
// business name and can't be written to.
export function withPages(contacts: Contact[], pages: NotionPage[], links: string[] = [], title = ""): { contacts: Contact[]; added: ChannelKind[]; people: number; named: number } {
  const out = contacts.map((c) => ({ ...c, channels: [...c.channels] }));
  const seen = new Set([...out.flatMap((c) => c.channels.map((ch) => keyOf(ch.kind, ch.value))), ...links.map((l) => keyOf("youtube", l))]);
  const added: ChannelKind[] = [];
  let people = 0;
  let named = 0;
  const fresh = (d: Partial<Details>) =>
    KINDS.flatMap(([key, kind]) =>
      (d[key] ?? []).flatMap((value) => {
        const k = keyOf(kind, value);
        if (seen.has(k)) return [];
        seen.add(k);
        return [{ kind, value }];
      }),
    );
  const into = (c: Contact | undefined, chs: Contact["channels"], name = "", role = "") => {
    if (!c) {
      if (!chs.length || out.length >= 50) return;
      out.push((c = { id: crypto.randomUUID(), name, role, channels: [] }));
      people++;
    }
    c.channels.push(...chs.slice(0, Math.max(0, 100 - c.channels.length)));
    added.push(...chs.map((ch) => ch.kind));
  };
  const nameFrom = (c: Contact | undefined, name = "") => {
    if (!c || !name || c.name === name) return;
    // a fuller name is only the person's part of the page's, never a name for several people ("Dr. A & Dr. B"); the contact's title stays ("Dr Najera", "Dr Robert Najera")
    const full = firstPart(name);
    if (isGreeting(c.name)) c.name = name;
    else if (samePerson(c.name, full) && words(full).length > words(c.name).length && !namesIn(full).length) c.name = DOCTOR.test(c.name) && !DOCTOR.test(full) ? `${DOCTOR.exec(c.name)![0]} ${full}` : full;
    else return;
    named++;
  };
  // the one contact a name is: of those it matches (itself or one of the
  // people it names), the closest, fewest words apart; null when two are as
  // close ("Dr. Kopelman" and Dr. Ross and Dr. Joel Kopelman), undefined for none
  const whose = (name = ""): Contact | null | undefined => {
    const gap = (c: Contact) => Math.min(...[c.name, ...namesIn(c.name)].map((p) => (samePerson(p, name) ? Math.abs(words(p).length - words(name).length) : Infinity)));
    const [a, b] = out.map((c) => ({ c, g: gap(c) })).filter((x) => x.g < Infinity).sort((x, y) => x.g - y.g);
    return !a ? undefined : b?.g === a.g ? null : a.c;
  };
  // whoever on the lead has one of these addresses
  const holder = (d: Details) => {
    const keys = new Set(KINDS.flatMap(([key, kind]) => d[key].map((v) => keyOf(kind, v))));
    return out.find((c) => c.channels.some((ch) => keys.has(keyOf(ch.kind, ch.value))));
  };
  // who someone on a page is: the one contact their name is, else whoever has
  // one of their addresses; a name two share settled by an address or their
  // LinkedIn's name, else null (their own contact)
  const who = (name: string, d: Details) => {
    const one = whose(name);
    return one !== null ? (one ?? holder(d)) : (holder(d) ?? whose(linkedinName(d.linkedin[0])) ?? null);
  };
  const lone = out.length === 1 && !out[0].channels.length ? namesIn(out[0].name) : [];
  for (const page of lone.length ? pages : []) {
    const them = lone.map((n) => page.others.find((o) => o.name && samePerson(n, o.name)));
    if (!them.every(Boolean)) continue;
    out.splice(0, 1, ...them.map((o, i) => ({ id: i ? crypto.randomUUID() : out[0].id, name: o!.name!, role: o!.role, channels: [] })));
    break;
  }

  for (const page of pages.filter((p) => !p.site)) {
    const found = who(page.name ?? "", page);
    const main = found === undefined ? out[0] : (found ?? undefined);
    nameFrom(main, page.name);
    into(main, fresh(page), page.name);
    for (const o of page.others) {
      const name = o.name || linkedinName(o.linkedin[0]);
      const theirs = who(name, o) ?? undefined;
      nameFrom(theirs, name);
      if (theirs && !theirs.role && o.role) theirs.role = o.role;
      into(theirs, fresh(o), name, o.role);
    }
  }
  for (const page of pages.filter((p) => p.site)) {
    const has = new Set(out.flatMap((c) => c.channels.map(listOf)));
    const theirs = Object.fromEntries(KINDS.map(([key]) => [key, has.has(key) ? [] : key === "emails" ? page.emails.slice(0, 3) : page[key]]));
    const chs = fresh(theirs);
    // the owner: whoever has no role (never a staff member), unnamed (or greeted, "there") taking the lead's name
    const owner = out.find((c) => !c.role);
    if (owner && chs.length && isGreeting(owner.name)) nameFrom(owner, title);
    into(owner, chs, title);
  }
  const reached = (c: Contact) => c.channels.some((ch) => REACH.includes(ch.kind));
  const clinic = pages.flatMap((p) => p.clinic?.instagram ?? []);
  if (clinic.length && !out.some((c) => c.channels.some((ch) => ch.kind === "instagram"))) {
    // the contact with the lead's own name when that's a business's ("Glow Clinic"), else a new one: unnamed when the lead is a person ("Dr Jane Kim")
    const own = out.find((c) => !c.role && samePerson(c.name, title) && !personal(c.name));
    if (own) own.role = "Clinic";
    into(own, fresh({ instagram: clinic }), personal(title) ? "" : title, "Clinic");
  }
  // the lead's own business name (a clinic's, a channel's) or none on a
  // contact that still can't be written to, beside people who can, is no one
  // to write to (and would hold the lead back from Ready to reach out): what
  // it has (a website, a TikTok) goes onto the first of them. A person's name
  // stays ("Jonathan Zelken" on the lead "Jonathan Zelken, MD").
  const first = out.find(reached);
  const placeholder = (c: Contact) => !c.role && !reached(c) && (isGreeting(c.name) || (samePerson(c.name, title) && !personal(c.name)));
  if (first) for (const c of out.filter(placeholder)) first.channels.push(...c.channels.slice(0, Math.max(0, 100 - first.channels.length)));
  return { contacts: first ? out.filter((c) => !placeholder(c)) : out, added, people, named };
}

export type Enriched = {
  // leads with a Notion page, and the pages read and not
  leads: number;
  pages: number;
  failed: string[];
  // leads given at least one of each kind
  got: Partial<Record<ChannelKind, number>>;
  channels: number;
  people: number;
  names: number;
  countries: number;
  // not reached before time ran out: send them again
  left: string[];
};

// The board's leads (or just these) with a Notion page in their Links, their
// pages read 4 at a time and added (withPages); Country set from a page while
// empty, a country the board lacks added as a tag as channelCountry does.
export async function enrichFromLinkedPages(boardId: string, leadIds?: string[]): Promise<Enriched> {
  const done: Enriched = { leads: 0, pages: 0, failed: [], got: {}, channels: 0, people: 0, names: 0, countries: 0, left: [] };
  const fields = await prisma.boardField.findMany({
    where: { boardId, OR: [{ kind: { in: ["links", "contacts"] } }, { kind: "select", name: { equals: "Country", mode: "insensitive" } }] },
    select: { id: true, kind: true, options: { select: { id: true, name: true, sortOrder: true } } },
  });
  const people = fields.find((f) => f.kind === "contacts");
  const linkFields = fields.filter((f) => f.kind === "links");
  const countryField = fields.find((f) => f.kind === "select");
  if (!people || !linkFields.length) return done;
  const leads = await prisma.lead.findMany({ where: { boardId, ...(leadIds && { id: { in: leadIds } }) }, select: { id: true, title: true, values: true } });
  const todo = leads.flatMap((l) => {
    const values = (l.values ?? {}) as Record<string, unknown>;
    const links = linkFields.flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as LinkValue[]) : [])).map((l) => l?.url ?? "");
    const urls = [...new Set(links.filter((u) => notionPageOf(u)))];
    return urls.length ? [{ id: l.id, title: l.title, values, links, urls }] : [];
  });
  done.leads = todo.length;

  // the same as channelCountry's: the colour addOption would give it
  const options = new Map((countryField?.options ?? []).map((o) => [o.name.toLowerCase(), Promise.resolve(o.id)]));
  let count = countryField?.options.length ?? 0;
  let sortOrder = Math.max(0, ...(countryField?.options ?? []).map((o) => o.sortOrder));
  const optionFor = (fieldId: string, name: string) => {
    const key = name.toLowerCase();
    if (!options.has(key)) {
      const color = COLOR_NAMES[(count++ % (COLOR_NAMES.length - 1)) + 1];
      options.set(key, tagFor(fieldId, name, color, ++sortOrder));
    }
    return options.get(key)!;
  };

  const until = Date.now() + BUDGET_MS;
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < todo.length) {
        const lead = todo[next++];
        const pages: NotionPage[] = [];
        let late = false;
        for (const url of lead.urls) {
          if (Date.now() > until) {
            late = true;
            break;
          }
          const page = await readNotionPage(url);
          if (page) pages.push(page);
          else done.failed.push(url);
        }
        if (late) {
          done.left.push(lead.id);
          continue;
        }
        done.pages += pages.length;
        if (!pages.length) continue;

        const before = Array.isArray(lead.values[people.id]) ? (lead.values[people.id] as Contact[]) : [];
        const r = withPages(before, pages, lead.links, lead.title);
        const cleaned = cleanValue("contacts", r.contacts);
        if (r.added.length || r.named) {
          if ("value" in cleaned) {
            // only over what was read: someone may have changed them meanwhile
            const n = await prisma.$executeRaw`UPDATE "Lead" SET "values" = jsonb_set(coalesce("values", '{}'::jsonb), ARRAY[${people.id}::text], ${JSON.stringify(cleaned.value)}::jsonb, true), "updatedAt" = now() WHERE id = ${lead.id} AND coalesce("values" -> ${people.id}::text, 'null'::jsonb) = ${JSON.stringify(lead.values[people.id] ?? null)}::jsonb`;
            if (n) {
              for (const kind of new Set(r.added)) done.got[kind] = (done.got[kind] ?? 0) + 1;
              done.channels += r.added.length;
              done.people += r.people;
              done.names += r.named;
            }
          }
        }
        const country = pages.find((p) => p.country)?.country;
        if (countryField && country && lead.values[countryField.id] == null) {
          const id = await optionFor(countryField.id, boardCountry(country));
          done.countries += await prisma.$executeRaw`UPDATE "Lead" SET "values" = jsonb_set(coalesce("values", '{}'::jsonb), ARRAY[${countryField.id}::text], ${JSON.stringify([id])}::jsonb, true), "updatedAt" = now() WHERE id = ${lead.id} AND coalesce("values" -> ${countryField.id}::text, 'null'::jsonb) = 'null'::jsonb`;
        }
      }
    }),
  );
  return done;
}
