import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { STAGE } from "@/lib/stages";
import { exportRow, toCsv, type ExportEvent } from "@/lib/taskExport";

// Every editing task — finished or still moving, any client — as a CSV for
// reviewing how the editors are doing. Admin and Abhishek only, checked
// against the signed-in session (not "viewing as").
export async function GET() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return new Response("Not allowed", { status: 403 });

  const [tasks, logs] = await Promise.all([
    prisma.task.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        assignedTo: { select: { name: true } },
        tags: { select: { name: true } },
        project: { select: { name: true, type: true, client: { select: { name: true } } } },
      },
    }),
    prisma.activityLog.findMany({
      where: { entity: "Task" },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);

  const byTask = new Map<string, ExportEvent[]>();
  for (const l of logs) {
    const list = byTask.get(l.entityId) ?? [];
    list.push({ at: l.createdAt, action: l.action, actor: l.actor.name });
    byTask.set(l.entityId, list);
  }

  const labels = Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, v.label])) as Parameters<typeof exportRow>[2];
  const now = new Date();
  const csv = toCsv(
    tasks.map((t) =>
      exportRow(
        {
          ...t,
          editor: t.assignedTo?.name ?? "",
          client: t.project.client.name,
          project: t.project.name || t.project.type,
          tags: t.tags.map((x) => x.name),
        },
        byTask.get(t.id) ?? [],
        labels,
        now
      )
    )
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="editor-work-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
