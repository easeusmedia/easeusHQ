import { prisma } from "@/lib/prisma";
import { DEVELOPER, DEVELOPER_MODE } from "@/lib/scope";
import { dayOf, isDead, leadEmails, outreachStart, phaseKey, reachedByDay, type BoardData, type Contact, type Draft, type FieldKind, type Mark, type Marks, type Person, type Platform, type SpaceCard, type SpaceKind } from "@/lib/space";

// Reading a department's pages for the server components that show them
// (org/[slug] and org/[slug]/[...path]). Access is checked by the pages.

export type SpaceNode = { id: string; teamId: string; parentId: string | null; kind: SpaceKind; name: string; slug: string };

const NODE = { id: true, teamId: true, parentId: true, kind: true, name: true, slug: true } as const;

// The pages a path names under a department: ["podcast"] →
// [Podcast]. null if any step doesn't exist, or it goes past a
// portal (boards are picked on the portal's page, not by path).
export async function resolvePath(teamId: string, path: string[]): Promise<SpaceNode[] | null> {
  if (!path.length || path.length > 2) return null;
  const trail: SpaceNode[] = [];
  let parentId: string | null = null;
  for (const slug of path) {
    const node: SpaceNode | null = (await prisma.space.findFirst({ where: { teamId, parentId, slug, kind: { in: ["section", "portal"] } }, select: NODE })) as SpaceNode | null;
    if (!node) return null;
    trail.push(node);
    parentId = node.id;
  }
  return trail;
}

// A page's sections or portals as cards, with what each holds
export async function childCards(teamId: string, parentId: string | null, base: string): Promise<SpaceCard[]> {
  const rows = await prisma.space.findMany({
    where: { teamId, parentId, kind: { in: ["section", "portal"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, name: true, slug: true, _count: { select: { children: true } }, children: { select: { _count: { select: { leads: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as SpaceKind,
    name: r.name,
    slug: r.slug,
    href: `${base}/${r.slug}`,
    children: r._count.children,
    leads: r.children.reduce((n, c) => n + c._count.leads, 0),
  }));
}

// A portal's boards, for its tabs
export async function boardsOf(portalId: string) {
  return prisma.space.findMany({ where: { parentId: portalId, kind: "board" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, slug: true } });
}

// Everything a board shows: its stages, properties (with their tags) and
// leads. The write-up and record load when a lead is opened.
export async function loadBoard(boardId: string): Promise<BoardData | null> {
  const board = await prisma.space.findFirst({
    where: { id: boardId, kind: "board" },
    select: {
      id: true,
      name: true,
      slug: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, color: true, messages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, channel: true, subject: true, body: true, note: true } } },
      },
      fields: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, kind: true, onCard: true, required: true, options: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } } } },
      leads: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          stageId: true,
          sortOrder: true,
          values: true,
          vars: true,
          drafts: true,
          marks: true,
          picks: true,
          assignedByName: true,
          assignedAt: true,
          stageSince: true,
          createdAt: true,
          editedByName: true,
          editedAt: true,
          createdBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          // where it has been (and when): whether it was ever reached out to, and on what
          events: { where: { kind: "moved" }, select: { toStage: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!board) return null;
  // Email, whatever its stage, from the sales inbox (whichever computer sent
  // it) and the mail tracker: what went to its addresses since it was added
  // (an hour's grace for an email sent just before), those emails' opens,
  // and what they wrote back after (a person, not a bounce or an auto-reply).
  // Emails from before it was a lead aren't its outreach.
  const leadAddresses = new Map(board.leads.map((l) => [l.id, leadEmails(l.values)]));
  const all = [...new Set([...leadAddresses.values()].flat())];
  const [sentTo, tracked, heard] = await Promise.all([
    prisma.mailMessage.findMany({ where: { outgoing: true, to: { in: all } }, select: { to: true, at: true } }),
    prisma.trackedMail.findMany({ where: { to: { in: all } }, select: { to: true, sentAt: true, opens: true, bouncedAt: true } }),
    prisma.mailMessage.findMany({ where: { outgoing: false, auto: false, from: { in: all } }, select: { from: true, at: true }, orderBy: { at: "asc" } }),
  ]);
  const contactFields = board.fields.filter((f) => f.kind === "contacts").map((f) => f.id);
  const contactsOf = (values: unknown) => contactFields.flatMap((id) => {
    const v = (values as Record<string, unknown> | null)?.[id];
    return Array.isArray(v) ? (v as Contact[]) : [];
  });
  const emailOf = (l: (typeof board.leads)[number]) => {
    const mine = leadAddresses.get(l.id) ?? [];
    const since = l.createdAt.getTime() - 3_600_000;
    const out = sentTo.filter((m) => mine.includes(m.to) && m.at.getTime() >= since).map((m) => m.at);
    const mails = tracked.filter((t) => mine.includes(t.to) && t.sentAt.getTime() >= since);
    const first = [...out, ...mails.map((t) => t.sentAt)].sort((a, b) => +a - +b)[0] ?? null;
    const reply = first && heard.find((h) => mine.includes(h.from) && h.at > first);
    // the day it was on when the reply came: its last move before, else where it is
    const moved = reply ? l.events.filter((e) => e.createdAt <= reply.at).pop()?.toStage : null;
    const stage = board.stages.find((s) => (moved ? s.name === moved : s.id === l.stageId)) ?? board.stages.find((s) => s.id === l.stageId);
    const opens = mails.reduce((n, t) => n + t.opens, 0);
    // who wrote back (each contact once, in the order they did): its name
    // from the lead's contacts, else the address
    const repliers = first ? [...new Set(heard.filter((h) => mine.includes(h.from) && h.at > first).map((h) => h.from))] : [];
    const nameOf = (address: string) => contactsOf(l.values).find((c) => c.channels?.some((ch) => ch.value?.trim().toLowerCase() === address))?.name?.trim() || address;
    return {
      sent: !!first,
      email: {
        sent: !!first,
        tracked: mails.length > 0,
        opens,
        // who opened: each contact's emails' opens (one email per contact,
        // so each open is theirs), most first
        openedBy: [...new Set(mails.map((t) => t.to))]
          .map((address) => ({ by: nameOf(address), address, opens: mails.filter((t) => t.to === address).reduce((n, t) => n + t.opens, 0) }))
          .filter((o) => o.opens > 0)
          .sort((a, b) => b.opens - a.opens),
        replied: reply && stage ? { ...({ day: phaseKey(stage), at: reply.at.toISOString() } satisfies Mark), by: repliers.map(nameOf).join(", "), address: repliers.join(", ") } : null,
        bounced: !reply && !opens && mails.some((t) => t.bouncedAt),
      },
    };
  };
  const messages = board.stages.flatMap((s) => s.messages.map((m) => ({ ...m, stageId: s.id })));
  // reached out: it has been in Ready to reach out, a day, or a stage after
  // them (but Dead), by the stage names its record kept
  const start = outreachStart(board.stages);
  const reachedNames = new Set(start < 0 ? [] : board.stages.slice(start).filter((s) => !isDead(s.name)).map((s) => s.name));
  const reached = (names: (string | null)[]) => start >= 0 && names.some((n) => !!n && (reachedNames.has(n) || dayOf(n) != null));
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    stages: board.stages.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    messages,
    fields: board.fields.map((f) => ({ ...f, kind: f.kind as FieldKind })),
    leads: board.leads.map((l) => {
      const { sent, email } = emailOf(l);
      const stageName = board.stages.find((s) => s.id === l.stageId)?.name ?? null;
      return {
      id: l.id,
      title: l.title,
      stageId: l.stageId,
      sortOrder: l.sortOrder,
      createdBy: l.createdBy,
      assignedTo: l.assignedTo,
      assignedByName: l.assignedByName,
      assignedAt: l.assignedAt?.toISOString() ?? null,
      values: (l.values ?? {}) as Record<string, unknown>,
      vars: (l.vars ?? {}) as Record<string, string>,
      email,
      marks: (l.marks ?? {}) as Marks,
      reachedOn: [...(start >= 0 && sent ? (["email"] as Platform[]) : []), ...reachedByDay({ stages: board.stages, messages }, [stageName, ...l.events.map((e) => e.toStage)])],
      picks: (l.picks ?? {}) as Record<string, string>,
      reached: reached([stageName, ...l.events.map((e) => e.toStage)]) || (start >= 0 && sent),
      drafts: (l.drafts ?? {}) as Record<string, Draft>,
      stageSince: l.stageSince.toISOString(),
      createdAt: l.createdAt.toISOString(),
      editedByName: l.editedByName,
      editedAt: l.editedAt?.toISOString() ?? null,
      };
    }),
  };
}

// Who a lead can be given to: on staff, and in the department (or Level 1)
export async function peopleOf(teamId: string): Promise<Person[]> {
  return prisma.user.findMany({
    where: { employment: { not: "former" }, OR: [{ role: "admin" }, ...(DEVELOPER_MODE ? [{ email: DEVELOPER }] : []), { departments: { some: { id: teamId } } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// For the sidebar: each department's sections, and each section's portals
export async function spaceTree(teamIds: string[]) {
  if (!teamIds.length) return [];
  return prisma.space.findMany({
    where: { teamId: { in: teamIds }, kind: { in: ["section", "portal"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, teamId: true, parentId: true, kind: true, name: true, slug: true },
  });
}

// Every page of a kind in the department, to start a new one as a copy of:
// "Podcast (Outreach)", "Dream 156 Podcasts (Core Offer) (Podcast)"
export async function templatesOf(teamId: string, kind: SpaceKind) {
  const rows = await prisma.space.findMany({
    where: { teamId, kind },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, parent: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.parent ? `${r.name} (${r.parent.name})` : r.name }));
}
