import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { ClientsSyncButton } from "./ClientsSyncButton";
import { ClientsBoard } from "./ClientsBoard";
import type { ClientCardData } from "./ClientCard";
import { clientLogoSrc } from "@/lib/slug";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  // Open to the whole team: everyone should be able to see what's
  // happening for a client, whatever their role. Rearranging them or
  // changing their status is for ops.

  const clients = await prisma.client.findMany({
    include: {
      tags: true,
      // counting only what's live — a card claiming "12 active projects"
      // when they all wrapped months ago is worse than no number
      projects: {
        where: { status: { not: "completed" } },
        include: { _count: { select: { tasks: { where: { status: { in: ACTIVE_STATUSES } } } } } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const cards: ClientCardData[] = clients.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    status: c.status,
    sortOrder: c.sortOrder,
    niche: c.niche,
    logo: clientLogoSrc(c),
    tags: c.tags,
    activeProjects: c.projects.length,
    activeTasks: c.projects.reduce((sum, p) => sum + p._count.tasks, 0),
  }));

  return (
    <>
      <ClientsBoard clients={cards} canArrange={!!me && me.role !== "employee"} />
      <ClientsSyncButton />
    </>
  );
}
