import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { resolveActingUser, isAbhishekOrAdmin } from "@/lib/actingUser";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WorkTaskBoard } from "./WorkTaskBoard";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";

export const dynamic = "force-dynamic";

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; view?: string }>;
}) {
  const { as, view } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) redirect("/login");

  // same "Viewing as" mechanism the rest of /tasks already uses — an admin
  // switching to someone else here manages *that person's* board, which is
  // also the entire delegation path (see actions.ts): there's no separate
  // assignee picker, an admin creates a task for someone else by viewing
  // as them first.
  const actingUser = resolveActingUser(users, sessionUserId, as) ?? sessionUser;
  const isAdmin = isAbhishekOrAdmin(sessionUser);
  const showEveryone = isAdmin && view === "all";

  const [projectsRaw, workTasks, clientTasks] = await Promise.all([
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.workTask.findMany({
      where: showEveryone ? {} : { assignedToId: actingUser.id },
      include: {
        assignedTo: true,
        createdBy: true,
        project: { include: { client: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    // read-only: whatever's already assigned to this person on the client
    // editing-queue board shows up here too, so "my tasks" is genuinely
    // everything on their plate, not just this new system's own tasks.
    // Managing these still happens on the real board (Board.tsx) — this is
    // just so they're visible from one place.
    showEveryone
      ? Promise.resolve([])
      : prisma.task.findMany({
          where: { assignedToId: actingUser.id, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: "desc" },
          include: { project: { include: { client: true } } },
        }),
  ]);

  const projects = projectsRaw.map((p) => ({ id: p.id, name: p.name || p.type, client: { name: p.client.name } }));

  const tasks = workTasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    category: t.category,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    sortOrder: t.sortOrder,
    links: (t.links as WorkTaskLink[]) ?? [],
    attachments: (t.attachments as WorkTaskAttachment[]) ?? [],
    projectId: t.projectId,
    project: t.project ? { name: t.project.name || t.project.type, client: { name: t.project.client.name } } : null,
    assignedTo: { id: t.assignedTo.id, name: t.assignedTo.name },
    createdBy: { id: t.createdBy.id, name: t.createdBy.name },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Tasks</h1>
          {actingUser.id !== sessionUser.id && (
            <p className="mt-1 text-xs text-muted">Viewing as {actingUser.name} — new tasks go on their board.</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1 text-sm">
            <a
              href="/tasks/my"
              className={`rounded-md px-3 py-1.5 ${!showEveryone ? "bg-surface text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {actingUser.name}
            </a>
            <a
              href="/tasks/my?view=all"
              className={`rounded-md px-3 py-1.5 ${showEveryone ? "bg-surface text-foreground" : "text-muted hover:text-foreground"}`}
            >
              Everyone
            </a>
          </div>
        )}
      </div>

      {!showEveryone && clientTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Assigned on the editing queue</h2>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface/40">
            {clientTasks.map((t) => (
              <a
                key={t.id}
                href="/tasks"
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted">{t.project.client.name}</span> · {t.title}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAGE[t.status].pill}`}>
                  {STAGE[t.status].label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <WorkTaskBoard
        tasks={tasks}
        projects={projects}
        actingUserId={actingUser.id}
        showAssignee={showEveryone}
        canCreate={!showEveryone}
      />
    </div>
  );
}
