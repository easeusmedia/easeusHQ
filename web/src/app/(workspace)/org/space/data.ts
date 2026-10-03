import { prisma } from "@/lib/prisma";
import type { BoardData, Draft, FieldKind, Person, SpaceCard, SpaceKind } from "@/lib/space";

// Reading a department's pages for the server components that show them
// (org/[slug] and org/[slug]/[...path]). Access is checked by the pages.

export type SpaceNode = { id: string; teamId: string; parentId: string | null; kind: SpaceKind; name: string; slug: string };

const NODE = { id: true, teamId: true, parentId: true, kind: true, name: true, slug: true } as const;

// The pages a path names under a department: ["outreach", "podcast"] →
// [Outreach, Podcast]. null if any step doesn't exist, or it goes past a
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
        select: { id: true, title: true, stageId: true, sortOrder: true, values: true, vars: true, drafts: true, stageSince: true, createdAt: true, editedByName: true, editedAt: true, createdBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } } },
      },
    },
  });
  if (!board) return null;
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    stages: board.stages.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    messages: board.stages.flatMap((s) => s.messages.map((m) => ({ ...m, stageId: s.id }))),
    fields: board.fields.map((f) => ({ ...f, kind: f.kind as FieldKind })),
    leads: board.leads.map((l) => ({
      id: l.id,
      title: l.title,
      stageId: l.stageId,
      sortOrder: l.sortOrder,
      createdBy: l.createdBy,
      assignedTo: l.assignedTo,
      values: (l.values ?? {}) as Record<string, unknown>,
      vars: (l.vars ?? {}) as Record<string, string>,
      drafts: (l.drafts ?? {}) as Record<string, Draft>,
      stageSince: l.stageSince.toISOString(),
      createdAt: l.createdAt.toISOString(),
      editedByName: l.editedByName,
      editedAt: l.editedAt?.toISOString() ?? null,
    })),
  };
}

// Who a lead can be given to: on staff, and in the department (or Level 1)
export async function peopleOf(teamId: string): Promise<Person[]> {
  return prisma.user.findMany({
    where: { employment: { not: "former" }, OR: [{ role: "admin" }, { email: "abhishek@easeus.media" }, { departments: { some: { id: teamId } } }] },
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

// Reach-outs done on a board: every move into a "Day …" stage is one (a
// first email, a follow-up). All time, and the last seven days.
export async function reachOuts(boardId: string) {
  const where = { lead: { boardId }, kind: "moved", toStage: { startsWith: "Day " } };
  const [total, week] = await Promise.all([
    prisma.leadEvent.count({ where }),
    prisma.leadEvent.count({ where: { ...where, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
  ]);
  return { total, week };
}
