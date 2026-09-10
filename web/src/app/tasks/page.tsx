import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { resolveActingUser } from "@/lib/actingUser";
import type { Role, TaskStatus } from "@/lib/workflow";
import { Board } from "./Board";
import { EditorViewToggle } from "./EditorViewToggle";

export const dynamic = "force-dynamic"; // always hits the DB, never statically cached

// once a task is delivered it's done — it drops off everyone's live board
// and into History (see history/page.tsx)
const ACTIVE_STATUSES: TaskStatus[] = [
  "queued",
  "editing",
  "sent_for_approval",
  "revision_requested",
  "final_export_ready",
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [users, projects, tasks] = await Promise.all([
    getAllUsers(),
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: true, project: { include: { client: true } } },
    }),
  ]);

  const editors = users.filter((u) => u.role === "employee"); // assignable pool — ops (admin/core) don't edit, they manage
  const actingUser = resolveActingUser(users, sessionUserId, as);

  if (!actingUser) {
    return (
      <>
        <h1 className="mb-6 text-xl font-semibold">No users yet</h1>
        <p className="text-sm text-muted">
          Run the seed script (<code>npx prisma db seed</code>) once <code>DATABASE_URL</code> is set.
        </p>
      </>
    );
  }

  const isEditor = actingUser.role === "employee";
  const visibleTasks = isEditor ? tasks.filter((t) => t.assignedToId === actingUser.id) : tasks;

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{isEditor ? "My Tasks" : "Editing Queue"}</h1>

      {isEditor ? (
        <EditorViewToggle
          tasks={visibleTasks}
          projects={projects}
          editors={editors}
          actingUserId={actingUser.id}
          actingRole={actingUser.role as Role}
        />
      ) : (
        <Board
          tasks={visibleTasks}
          projects={projects}
          editors={editors}
          actingUserId={actingUser.id}
          actingRole={actingUser.role as Role}
          canCreate
        />
      )}
    </>
  );
}
