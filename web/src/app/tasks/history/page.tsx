import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { resolveActingUser } from "@/lib/actingUser";
import type { TaskStatus } from "@/lib/workflow";
import { HistoryList } from "../HistoryList";

export const dynamic = "force-dynamic";

// tasks ops has fully finished with — see page.tsx for the active cutoff
// ("Final export ready" still shows on the live board, visible but not
// actionable for editors, so it isn't history yet)
const COMPLETED_STATUSES: TaskStatus[] = ["delivered_and_uploaded"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [users, tasks] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { status: { in: COMPLETED_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { updatedAt: "desc" },
      include: { project: { include: { client: true } } },
    }),
  ]);

  const actingUser = resolveActingUser(users, sessionUserId, as);
  if (!actingUser) return null;

  const isEditor = actingUser.role === "employee";
  // an editor sees only their own completed work; admin/core see everyone's, for KPI review
  const visible = isEditor ? tasks.filter((t) => t.assignedToId === actingUser.id) : tasks;

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">History</h1>
      <HistoryList tasks={visible} />
    </>
  );
}
