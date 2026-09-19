import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { STAGE } from "@/lib/stages";
import { exportRow, toCsv, unionRows, type ExportEvent } from "@/lib/taskExport";
import { activeHours, onTime, turnaroundHours, type HistoryItem } from "@/lib/history";

// Every piece of work this company has recorded, in one spreadsheet: the
// editing queue with its full per-stage timings and revision counts, and
// everyone's own work tasks alongside it. Admin and Abhishek only, checked
// against the signed-in session (not "viewing as"). The Export button on
// History writes out whatever is filtered on screen; this is the lot.
export async function GET() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return new Response("Not allowed", { status: 403 });

  const [tasks, workTasks, logs] = await Promise.all([
    prisma.task.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        assignedTo: { select: { name: true, team: { select: { name: true } } } },
        tags: { select: { name: true } },
        project: { select: { name: true, type: true, client: { select: { name: true } } } },
      },
    }),
    prisma.workTask.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        assignedTo: { select: { name: true, team: { select: { name: true } } } },
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

  const clientRows = tasks.map((t) => ({
    Kind: "Client work",
    Person: t.assignedTo?.name ?? "",
    Team: t.assignedTo?.team?.name ?? "",
    ...exportRow(
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
    ),
  }));

  // a work task records no stage changes, so it carries the columns every
  // piece of work has and leaves the pipeline ones empty
  const workRows = workTasks.map((t) => {
    const item: HistoryItem = {
      id: t.id,
      kind: "internal",
      title: t.title,
      personId: t.assignedToId,
      person: t.assignedTo.name,
      team: t.assignedTo.team?.name ?? null,
      client: t.project?.client.name ?? null,
      project: t.project ? t.project.name || t.project.type : null,
      tags: t.tags.map((x) => x.name),
      createdAt: t.createdAt,
      startedAt: null,
      completedAt: t.completedAt ?? t.updatedAt,
      dueDate: t.dueDate,
      revisions: 0,
    };
    const finished = t.status === "done";
    const ist = (d: Date | null) => (d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16) : "");
    return {
      Kind: "Own work",
      Person: item.person,
      Team: item.team ?? "",
      "Task ID": t.id,
      Task: t.title,
      Client: item.client ?? "",
      Project: item.project ?? "",
      Editor: item.person,
      Tags: item.tags.join(", "),
      "Current status": t.status,
      Finished: finished ? "yes" : "no",
      "Created (IST)": ist(t.createdAt),
      "Due (IST)": ist(t.dueDate),
      "Delivered (IST)": finished ? ist(item.completedAt) : "",
      "Hours: created to delivered": finished ? turnaroundHours(item) : "",
      "Hours worked (start to finish)": finished ? activeHours(item) ?? "" : "",
      "On time": finished && onTime(item) !== null ? (onTime(item) ? "yes" : "no") : "",
      Brief: t.notes ?? "",
    };
  });

  const csv = toCsv(unionRows([...clientRows, ...workRows]));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="easeus-work-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
