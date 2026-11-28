import { prisma } from "./prisma.ts";
import { channelPath } from "./channelCountry.ts";
import type { Contact } from "./space.ts";
export { NEEDS_CONTACT, reachable } from "./space.ts";

// Duplicate leads (Abhishek, 28 Nov 2026: people adding leads for an
// incentive could add one that's already there): a lead's YouTube channel is
// its own, so a lead whose channel is already on another lead anywhere in
// Sales (Leadwell's tabs, every outreach board, Dead leads) isn't added again,
// by hand, by an import or through the MCP; the lead already there is named
// instead. Matched on the channel's address (@handle, /channel/ id, /c/ or
// /user/ name), however the link around it is written. And a lead needs a way
// to reach someone: at least one person with an email, phone or handle.

const key = (raw: unknown, isYoutube: boolean) => (typeof raw === "string" ? (channelPath(raw, isYoutube)?.toLowerCase() ?? null) : null);

// the YouTube channels a lead names: in its links, or as a person's YouTube
export function channelsIn(links: { url?: unknown }[], contacts: Contact[]): string[] {
  const keys = [...links.map((l) => key(l?.url, false)), ...contacts.flatMap((c) => (c?.channels ?? []).filter((ch) => ch?.kind === "youtube").map((ch) => key(ch.value, true)))];
  return [...new Set(keys.filter((k): k is string => !!k))];
}

// the same, from a stored lead's values, whatever its properties are called:
// a list of links ({ url }) or of people ({ channels })
export function channelsOfValues(values: unknown): string[] {
  if (!values || typeof values !== "object") return [];
  const lists = Object.values(values as Record<string, unknown>).filter(Array.isArray) as unknown[][];
  const objects = (l: unknown[]) => l.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  return channelsIn(
    lists.flatMap((l) => objects(l).filter((x) => "url" in x)),
    lists.flatMap((l) => objects(l).filter((x) => Array.isArray(x.channels))) as Contact[],
  );
}

// The lead already there, as the warning names it
export type SameLead = {
  id: string;
  title: string;
  // Leadwell › Podcast, and the stage it's in there (Dead leads among them)
  where: string;
  stage: string;
  addedBy: string;
  addedOn: string;
  assignedTo: string | null;
  // to open it
  href: string;
};

const likeSafe = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// The Sales leads already holding any of these channels (but `except`)
export async function sameChannel(channels: string[], except?: string): Promise<SameLead[]> {
  const keys = new Set(channels.map((c) => c.toLowerCase()));
  if (!keys.size) return [];
  const team = await prisma.team.findUnique({ where: { slug: "sales" }, select: { id: true, slug: true } });
  if (!team) return [];
  // a cheap pass on the text first (the channel's name somewhere in the
  // lead), then each one read properly
  const names = [...keys].map((k) => `%${likeSafe(k.replace(/^@|^(?:channel|c|user)\//, ""))}%`);
  const rows = await prisma.$queryRaw<{ id: string; values: unknown }[]>`
    SELECT l.id, l.values FROM "Lead" l JOIN "Space" s ON s.id = l."boardId"
    WHERE s."teamId" = ${team.id} AND lower(l.values::text) LIKE ANY(${names}::text[])`;
  const ids = rows.filter((r) => r.id !== except && channelsOfValues(r.values).some((k) => keys.has(k))).map((r) => r.id);
  if (!ids.length) return [];
  const [leads, spaces] = await Promise.all([
    prisma.lead.findMany({
      where: { id: { in: ids.slice(0, 10) } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, createdAt: true, boardId: true, stage: { select: { name: true } }, createdBy: { select: { name: true } }, assignedTo: { select: { name: true } } },
    }),
    prisma.space.findMany({ where: { teamId: team.id }, select: { id: true, name: true, slug: true, parentId: true } }),
  ]);
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const chain = (id: string) => {
    const out: { name: string; slug: string }[] = [];
    for (let s = byId.get(id); s; s = s.parentId ? byId.get(s.parentId) : undefined) out.unshift(s);
    return out;
  };
  return leads.map((l) => {
    const up = chain(l.boardId);
    const board = up.pop();
    return {
      id: l.id,
      title: l.title,
      where: [...up, ...(board ? [board] : [])].map((s) => s.name).join(" › "),
      stage: l.stage.name,
      addedBy: l.createdBy.name,
      addedOn: l.createdAt.toISOString(),
      assignedTo: l.assignedTo?.name ?? null,
      href: `/org/${team.slug}/${up.map((s) => s.slug).join("/")}?board=${board?.slug ?? ""}&lead=${l.id}`,
    };
  });
}

// One line saying which lead it is, for an error or the MCP
export function sameLine(s: SameLead): string {
  const on = new Date(s.addedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return `"${s.title}" in ${s.where} (${s.stage}), added by ${s.addedBy} on ${on}${s.assignedTo ? `, with ${s.assignedTo}` : ""}`;
}
