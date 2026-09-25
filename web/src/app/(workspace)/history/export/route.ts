import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assigneeWhere } from "@/lib/scope";
import { STAGE, parseStageChange } from "@/lib/stages";
import { exportRow, toCsv, unionRows, type ExportEvent } from "@/lib/taskExport";
import {
  activeHours,
  filterHistory,
  onTime,
  summarize,
  turnaroundHours,
  type Filters,
  type GroupBy,
  type HistoryItem,
} from "@/lib/history";

// The spreadsheet behind History's Export button: the same work, under the
// same filters and the same grouping as whatever is on screen. A detailed
// export carries every stage's timings and the whole status trail, which is
// why it's built here — those come from the activity log, not the task.
//
// Scoped like the page itself (lib/scope): your own work, your team's, or
// everyone's.
const day = (d: Date | null) => (d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16) : "");

export async function GET(request: Request) {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user) return new Response("Not allowed", { status: 403 });

  const params = new URL(request.url).searchParams;
  const filters: Filters = {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    personId: params.get("personId") ?? undefined,
    team: params.get("team") ?? undefined,
    client: params.get("client") ?? undefined,
    tag: params.get("tag") ?? undefined,
    kind: (params.get("kind") as Filters["kind"]) ?? undefined,
    search: params.get("search") ?? undefined,
  };
  const group = params.get("group");
  const grouped = group && group !== "list" ? (group as GroupBy) : null;

  const scope = assigneeWhere({ id: user.id, role: user.role, email: user.email, teamId: user.teamId });
  const person = { select: { id: true, name: true, team: { select: { name: true } } } };
  const project = { select: { name: true, type: true, client: { select: { name: true } } } };

  const [tasks, workTasks, logs] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, status: "delivered_and_uploaded" },
      orderBy: { updatedAt: "desc" },
      include: { assignedTo: person, tags: { select: { name: true } }, project },
    }),
    prisma.workTask.findMany({
      where: { ...scope, status: "done" },
      orderBy: { completedAt: "desc" },
      include: { assignedTo: person, tags: { select: { name: true } }, project },
    }),
    prisma.activityLog.findMany({
      where: { entity: "Task" },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);

  const trail = new Map<string, ExportEvent[]>();
  for (const l of logs) {
    const list = trail.get(l.entityId) ?? [];
    list.push({ at: l.createdAt, action: l.action, actor: l.actor.name });
    trail.set(l.entityId, list);
  }

  const startedAt = (taskId: string): Date | null =>
    trail.get(taskId)?.find((e) => parseStageChange(e.action)?.to === "editing")?.at ??
    trail.get(taskId)?.find((e) => parseStageChange(e.action))?.at ??
    null;

  const asItem = (t: (typeof tasks)[number] | (typeof workTasks)[number], kind: HistoryItem["kind"]): HistoryItem => ({
    id: t.id,
    kind,
    title: t.title,
    personId: t.assignedTo?.id ?? "unassigned",
    person: t.assignedTo?.name ?? "Unassigned",
    team: t.assignedTo?.team?.name ?? null,
    client: t.project?.client.name ?? null,
    project: t.project ? t.project.name || t.project.type : null,
    tags: t.tags.map((x) => x.name),
    createdAt: t.createdAt,
    startedAt: kind === "client" ? startedAt(t.id) : null,
    completedAt: ("completedAt" in t ? t.completedAt : null) ?? t.updatedAt,
    dueDate: t.dueDate,
    revisions: "revisionCount" in t ? t.revisionCount : 0,
  });

  const byId = new Map([...tasks, ...workTasks].map((t) => [t.id, t]));
  const items = filterHistory(
    [...tasks.map((t) => asItem(t, "client")), ...workTasks.map((t) => asItem(t, "internal"))],
    filters
  );

  const labels = Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, v.label])) as Parameters<typeof exportRow>[2];
  const now = new Date();

  const rows = grouped
    ? summarize(items, grouped).map((r) => ({
        [grouped === "tag" ? "Type of work" : grouped[0].toUpperCase() + grouped.slice(1)]: r.key,
        Finished: r.completed,
        "Finished per week": r.perWeek,
        "Median turnaround (hours)": r.medianTurnaround,
        "Median working time (hours)": r.medianActive ?? "",
        "Revisions per task": r.revisionsPerTask,
        "On time %": r.onTimePct ?? "",
        "First finished (IST)": day(r.firstAt),
        "Last finished (IST)": day(r.lastAt),
      }))
    : items.map((item) => {
        const row = byId.get(item.id)!;
        const shared = {
          Kind: item.kind === "client" ? "Client work" : "Own work",
          Person: item.person,
          Team: item.team ?? "",
          "Started (IST)": day(item.startedAt),
          "Turnaround hours (created → finished)": turnaroundHours(item),
          "Working hours (started → finished)": activeHours(item) ?? "",
          "On time": onTime(item) === null ? "" : onTime(item) ? "yes" : "no",
        };
        // an editing-queue task also carries every stage's timings, worked
        // out from its trail; a work task has no stages to time
        if (item.kind === "client" && "revisionCount" in row) {
          return {
            ...shared,
            ...exportRow(
              {
                ...row,
                editor: item.person,
                client: item.client ?? "",
                project: item.project ?? "",
                tags: item.tags,
              },
              trail.get(item.id) ?? [],
              labels,
              now
            ),
          };
        }
        return {
          ...shared,
          "Task ID": item.id,
          Task: item.title,
          Client: item.client ?? "",
          Project: item.project ?? "",
          Tags: item.tags.join(", "),
          "Current status": "done",
          Finished: "yes",
          "Created (IST)": day(item.createdAt),
          "Due (IST)": day(item.dueDate),
          "Delivered (IST)": day(item.completedAt),
          Brief: "notes" in row ? row.notes ?? "" : "",
        };
      });

  const what = grouped ? `by-${grouped}` : "tasks";
  return new Response(toCsv(unionRows(rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="easeus-history-${what}-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
