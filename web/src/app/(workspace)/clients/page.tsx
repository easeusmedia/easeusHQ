import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { visibleClientWhere } from "@/lib/scope";
import { ClientsSyncButton } from "./ClientsSyncButton";
import { ClientsBoard } from "./ClientsBoard";
import type { ClientCardData } from "./ClientCard";
import { logoSrcAt } from "@/lib/photos";
import { logoVersions } from "@/lib/pictureVersions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [sessionUserId, users] = await Promise.all([getSessionUserId(), getAllUsers()]);
  if (!sessionUserId) redirect("/login");
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  // an editor sees only the clients given to them, and counts only their
  // own work on each (lib/scope)
  const editor = me.role === "employee";
  const [clients, logos] = await Promise.all([
    prisma.client.findMany({
      where: visibleClientWhere(me),
      // a card shows none of these: the logo is addressed by its version, below
      omit: { avatarUrl: true, brandGuidelines: true, sop: true, qualityChecklist: true, meetingNotes: true, resources: true, notes: true, address: true },
      include: {
        tags: true,
        // counting only what's live — a card claiming "12 active projects"
        // when they all wrapped months ago is worse than no number
        projects: {
          where: { status: { not: "completed" } },
          include: { _count: { select: { tasks: { where: { status: { in: ACTIVE_STATUSES }, ...(editor ? { assignedToId: me.id } : {}) } } } } },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    logoVersions(),
  ]);
  // Open to the whole team, bar editors (above). Rearranging them or
  // changing their status is for ops.

  const cards: ClientCardData[] = clients.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    status: c.status,
    sortOrder: c.sortOrder,
    niche: c.niche,
    logo: logoSrcAt(c.slug, logos.get(c.id)),
    tags: c.tags,
    // an editor's count is the projects with their own work in hand
    activeProjects: editor ? c.projects.filter((p) => p._count.tasks > 0).length : c.projects.length,
    activeTasks: c.projects.reduce((sum, p) => sum + p._count.tasks, 0),
  }));

  return (
    <>
      <ClientsBoard clients={cards} canArrange={!editor} />
      {!editor && <ClientsSyncButton />}
    </>
  );
}
