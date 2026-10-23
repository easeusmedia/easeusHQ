import { prisma } from "./prisma.ts";
import { boardCountry } from "./channelCountry.ts";
import { cleanValue, COLOR_NAMES, type ChannelKind, type Contact, type LinkValue } from "./space.ts";

// A lead's contact details from the public Notion page(s) in its Links
// (Abhishek, 23 Oct 2026): the Dream 300 file has no emails or handles, its
// doctors' Notion pages do ("Email ID 1: …", "LinkedIn Profile: …",
// "Instagram Link: …"), read with no token as the page's own site reads them.
// Only added, never replacing: emails and handles the lead lacks, a name for a
// contact without one, Country while empty. Staff written on a page under
// their own heading ("CEO:", "Marketing Director:") or a doctor named in the
// label ("Email ID of Dr. Luke Maxfield") are their own contacts, never the
// doctor's; the clinic's, brand's and other accounts ("Clinic's IG") are left
// out.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const AT_ONCE = 4;
const FETCH_MS = 8_000;
// no new read starts after this; one read in flight can add FETCH_MS, so the whole stays under 45 s
const BUDGET_MS = 34_000;

export type Details = { emails: string[]; linkedin: string[]; instagram: string[]; youtube: string[]; phones: string[]; websites: string[] };
export type Other = Details & { role: string; name?: string };
export type NotionPage = Details & { name?: string; country?: string; others: Other[] };

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

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const URLS = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:instagram|linkedin|youtube)\.com\/[^\s<>()"']+|https?:\/\/[^\s<>()"']+/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
// "Label: value", the colon not a link's ("https://…")
const LABEL = /^([^:\n]{1,60}?)\s*:(?!\/\/)\s*(.*)$/;
// the outreach drafts written on the page, not details
const COPY = /copy|subject|^(instagram|linkedin|ig|email)\s*dm$/i;
const CHANNEL = /e-?mail|linked\s*in|insta|\big\b|\byt\b|you\s*tube|web|site|phone|whats\s*app|mobile|\btel\b|link|page|profile|tik\s*tok|facebook|twitter/i;
// someone else's account: the clinic's, a brand's, a nurse's, an app's
const NOT_THEIRS = /clinic|brand|other|nurse|podcast|academy|\bapp\b|business|account|common|company|course|page 2/i;
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

const empty = (): Details => ({ emails: [], linkedin: [], instagram: [], youtube: [], phones: [], websites: [] });
const add = (list: string[], v: string | null) => {
  if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
};

// A page's properties ({ Name, Country }) and text lines, into its doctor and
// anyone else on it
export function detailsOf(props: Record<string, string>, lines: string[]): NotionPage {
  const main = empty();
  const others: Other[] = [];
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
      for (const u of value.match(URLS) ?? []) {
        add(p.instagram, instagramUrl(u));
        add(p.linkedin, linkedinUrl(u));
        add(p.youtube, youtubeUrl(u));
      }
      if (PHONE_LABEL.test(label)) for (const n of value.match(PHONE) ?? []) add(p.phones, n.replace(/\s+/g, " "));
    }
    if (WEBSITE.test(label)) for (const u of value.match(/https?:\/\/[^\s<>()"']+/gi) ?? []) add(p.websites, websiteUrl(u));
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
    others: others.filter((o) => (o.name || o.emails.length || o.linkedin.length) && o.emails.length + o.linkedin.length + o.instagram.length + o.phones.length + o.websites.length > 0),
  };
}

// ---- Reading a page ----

// the site and page a Notion link points at
export function notionPageOf(url: string): { origin: string; id: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || !/(^|\.)notion\.(so|site)$/i.test(u.hostname)) return null;
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

// One public Notion page, read and parsed; null when it can't be
export async function readNotionPage(url: string, ms = FETCH_MS): Promise<NotionPage | null> {
  const at = notionPageOf(url);
  if (!at) return null;
  try {
    const res = await fetch(`${at.origin}/api/v3/loadPageChunk`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ pageId: at.id, limit: 100, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false }),
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const page = pageOf(((await res.json()) as Rec)?.recordMap, at.id);
    return page ? detailsOf(page.props, page.lines) : null;
  } catch {
    return null;
  }
}

// ---- Onto a lead ----

const norm = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
const keyOf = (kind: ChannelKind, v: string) =>
  `${kind}:${norm((kind === "instagram" ? instagramUrl(v.trim().replace(/^@/, "instagram.com/")) : kind === "linkedin" ? linkedinUrl(v) : kind === "youtube" ? youtubeUrl(v) : null) ?? v)}`;
const KINDS: [keyof Details, ChannelKind][] = [
  ["emails", "email"],
  ["linkedin", "linkedin"],
  ["instagram", "instagram"],
  ["youtube", "youtube"],
  ["phones", "phone"],
  ["websites", "other"],
];

// A lead's contacts with its pages' details added: the doctor's onto the
// contact their name matches, else the first (named, if it has no name); each
// other person onto the contact their name matches; staff with no contact of
// their own (a CEO, a marketing director) stay off unless staff is asked for,
// as they'd each get the doctor's whole sequence (Abhishek's call, 23 Oct
// 2026). Nothing already on the lead (or a YouTube channel in its Links) twice.
export function withPages(contacts: Contact[], pages: NotionPage[], links: string[] = [], staff = false): { contacts: Contact[]; added: ChannelKind[]; people: number; named: number } {
  const out = contacts.map((c) => ({ ...c, channels: [...c.channels] }));
  const seen = new Set([...out.flatMap((c) => c.channels.map((ch) => keyOf(ch.kind, ch.value))), ...links.map((l) => keyOf("youtube", l))]);
  const added: ChannelKind[] = [];
  let people = 0;
  let named = 0;
  const fresh = (d: Details) =>
    KINDS.flatMap(([key, kind]) =>
      d[key].flatMap((value) => {
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
  for (const page of pages) {
    const main = out.find((c) => samePerson(c.name, page.name)) ?? out[0];
    if (main && !main.name.trim() && page.name) {
      main.name = page.name;
      named++;
    }
    into(main, fresh(page), page.name);
    for (const o of page.others) {
      const theirs = o.name ? out.find((c) => samePerson(c.name, o.name)) : undefined;
      if (theirs || staff) into(theirs, fresh(o), o.name, o.role);
    }
  }
  return { contacts: out, added, people, named };
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
  const leads = await prisma.lead.findMany({ where: { boardId, ...(leadIds && { id: { in: leadIds } }) }, select: { id: true, values: true } });
  const todo = leads.flatMap((l) => {
    const values = (l.values ?? {}) as Record<string, unknown>;
    const links = linkFields.flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as LinkValue[]) : [])).map((l) => l?.url ?? "");
    const urls = [...new Set(links.filter((u) => notionPageOf(u)))];
    return urls.length ? [{ id: l.id, values, links, urls }] : [];
  });
  done.leads = todo.length;

  // the same as channelCountry's: the colour addOption would give it
  // ponytail: two runs on one board at the same moment could each add the same new country, as addOption could
  const options = new Map((countryField?.options ?? []).map((o) => [o.name.toLowerCase(), Promise.resolve(o.id)]));
  let count = countryField?.options.length ?? 0;
  let sortOrder = Math.max(0, ...(countryField?.options ?? []).map((o) => o.sortOrder));
  const optionFor = (fieldId: string, name: string) => {
    const key = name.toLowerCase();
    if (!options.has(key)) {
      const color = COLOR_NAMES[(count++ % (COLOR_NAMES.length - 1)) + 1];
      options.set(key, prisma.fieldOption.create({ data: { fieldId, name, color, sortOrder: ++sortOrder }, select: { id: true } }).then((o) => o.id));
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
        const r = withPages(before, pages, lead.links);
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
