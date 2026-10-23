import { prisma } from "./prisma.ts";
import { COLOR_NAMES, type Contact, type LinkValue } from "./space.ts";

// A Sales lead's Country, from its YouTube channel (Abhishek, 23 Oct 2026):
// the channel's About page says where it is ("country":"United States" in
// the page's data), read with no key and no Claude. Only an empty Country is
// filled, never one already set; a channel that doesn't say leaves it empty.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const AT_ONCE = 6;
const FETCH_MS = 8_000;
// a page's actions have a minute (its maxDuration): no new read starts after this
const BUDGET_MS = 40_000;

// the board's own names for the countries it already had
const SHORT: Record<string, string> = { "united states": "USA", "united kingdom": "UK", "united arab emirates": "UAE" };
export const boardCountry = (name: string) => SHORT[name.trim().toLowerCase()] ?? name.trim();

// the channel's About page, from the lead's Links or a contact's YouTube
// (a channel address, or a bare @handle); a video link isn't a channel
const CHANNEL = /youtube\.com\/(@[^/?#\s]+|(?:channel|c|user)\/[^/?#\s]+)/i;
export function aboutUrlOf(values: Record<string, unknown>, fields: { id: string; kind: string }[]): string | null {
  const all = (kind: string) => fields.filter((f) => f.kind === kind).flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as unknown[]) : []));
  const youtubes = (all("contacts") as Contact[]).flatMap((c) => c.channels ?? []).filter((ch) => ch.kind === "youtube").map((ch) => ch.value.trim());
  for (const raw of [...(all("links") as LinkValue[]).map((l) => l.url ?? ""), ...youtubes]) {
    const path = CHANNEL.exec(raw)?.[1] ?? (/^@[\w.-]+$/.test(raw) ? raw : null);
    if (path) return `https://www.youtube.com/${path}/about`;
  }
  return null;
}

// the country an About page names, if it names one
export function countryIn(html: string): string | null {
  const m = /"country":("(?:[^"\\]|\\.)*")/.exec(html);
  if (!m) return null;
  try {
    const c = String(JSON.parse(m[1])).trim();
    return c && c.length <= 60 ? c : null;
  } catch {
    return null;
  }
}

async function channelCountry(url: string, ms: number): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, signal: AbortSignal.timeout(ms) });
    return res.ok ? countryIn(await res.text()) : null;
  } catch {
    return null;
  }
}

// The board's leads (or just these) with an empty Country and a YouTube
// channel: read 6 at a time, a country the board lacks added as a tag (the
// colour addOption would give it), set as the board stores a tag. How many
// were filled. A board without a Country tag property does nothing.
export async function fillCountries(boardId: string, leadIds?: string[]): Promise<number> {
  const field = await prisma.boardField.findFirst({
    where: { boardId, kind: "select", name: { equals: "Country", mode: "insensitive" } },
    select: { id: true, options: { select: { id: true, name: true, sortOrder: true } } },
  });
  if (!field) return 0;
  const [fields, leads] = await Promise.all([
    prisma.boardField.findMany({ where: { boardId, kind: { in: ["links", "contacts"] } }, select: { id: true, kind: true } }),
    prisma.lead.findMany({ where: { boardId, ...(leadIds && { id: { in: leadIds } }) }, select: { id: true, values: true } }),
  ]);
  const todo = leads.flatMap((l) => {
    const v = (l.values ?? {}) as Record<string, unknown>;
    const url = v[field.id] == null ? aboutUrlOf(v, fields) : null;
    return url ? [{ id: l.id, url }] : [];
  });

  // ponytail: two fills on one board at the same moment could each add the same new country, as addOption could
  const options = new Map(field.options.map((o) => [o.name.toLowerCase(), Promise.resolve(o.id)]));
  let count = field.options.length;
  let sortOrder = Math.max(0, ...field.options.map((o) => o.sortOrder));
  const optionFor = (name: string) => {
    const key = name.toLowerCase();
    if (!options.has(key)) {
      const color = COLOR_NAMES[(count++ % (COLOR_NAMES.length - 1)) + 1];
      options.set(key, prisma.fieldOption.create({ data: { fieldId: field.id, name, color, sortOrder: ++sortOrder }, select: { id: true } }).then((o) => o.id));
    }
    return options.get(key)!;
  };

  const until = Date.now() + BUDGET_MS;
  let next = 0;
  let filled = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < todo.length && Date.now() < until) {
        const lead = todo[next++];
        const country = await channelCountry(lead.url, FETCH_MS);
        if (!country) continue;
        const id = await optionFor(boardCountry(country));
        // only while still empty: someone may have set it meanwhile
        const n = await prisma.$executeRaw`UPDATE "Lead" SET "values" = jsonb_set(coalesce("values", '{}'::jsonb), ARRAY[${field.id}::text], ${JSON.stringify([id])}::jsonb, true), "updatedAt" = now() WHERE id = ${lead.id} AND coalesce("values" -> ${field.id}::text, 'null'::jsonb) = 'null'::jsonb`;
        filled += n; // not `filled += await`: that reads filled before the wait and drops the other workers' counts
      }
    }),
  );
  return filled;
}
