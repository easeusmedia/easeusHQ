import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { ClientsSyncButton } from "./ClientsSyncButton";
import { ClientsBoard } from "./ClientsBoard";
import type { ClientCardData } from "./ClientCard";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (me?.role === "employee") redirect("/tasks"); // admin/core only — same bar as Calendar

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
    orderBy: { name: "asc" },
  });

  const cards: ClientCardData[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    avatarUrl: c.avatarUrl,
    tags: c.tags,
    activeProjects: c.projects.length,
    activeTasks: c.projects.reduce((sum, p) => sum + p._count.tasks, 0),
  }));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <ClientsSyncButton />
      </div>

      <ClientsBoard clients={cards} />
    </>
  );
}
