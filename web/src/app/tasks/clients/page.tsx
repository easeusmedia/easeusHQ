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
    niche: c.niche,
    avatarUrl: c.avatarUrl,
    tags: c.tags,
    activeProjects: c.projects.length,
    activeTasks: c.projects.reduce((sum, p) => sum + p._count.tasks, 0),
  }));

  // only what's live counts towards the totals — a paused or wrapped-up
  // client's leftovers would make the roster look busier than it is
  const live = cards.filter((c) => c.status === "current");
  const totals = [
    { label: live.length === 1 ? "active client" : "active clients", value: live.length },
    {
      label: "active projects",
      value: live.reduce((n, c) => n + c.activeProjects, 0),
    },
    { label: "active tasks", value: live.reduce((n, c) => n + c.activeTasks, 0) },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <ClientsSyncButton />
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        {totals.map((t) => (
          <div key={t.label} className="card-surface rounded-2xl px-5 py-4 shadow-sm">
            <p className="text-2xl font-semibold leading-8 tabular-nums">{t.value}</p>
            <p className="mt-0.5 text-xs text-muted">{t.label}</p>
          </div>
        ))}
      </div>

      <ClientsBoard clients={cards} />
    </>
  );
}
