import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { LIVE_TASK } from "@/lib/workflow";
import { parseStageChange } from "@/lib/stages";
import { DEFAULT_TARGETS, KPI_TARGETS, hoursLabel, meets, shiftMonth, type KpiEntry, type KpiKey, type KpiTask, type Kpis, type Targets } from "@/lib/editorKpi";

// ?month=, if it's a real month not in the future; this month otherwise
export function pickMonth(asked: string | undefined, thisMonth: string) {
  return asked && /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
}

// the five numbers every editor is read by, in the order they're read
export function headline(k: Kpis, t: Targets): { key: KpiKey; label: string; value: number | null; text: string; ok: boolean | null }[] {
  const rows: { key: KpiKey; label: string; value: number | null; text: string }[] = [
    { key: "delivered", label: "Delivered", value: k.delivered, text: String(k.delivered) },
    { key: "turnaroundHours", label: "Turnaround", value: k.turnaroundHours, text: k.turnaroundHours === null ? "–" : hoursLabel(k.turnaroundHours) },
    { key: "mistakes", label: "Mistakes", value: k.mistakes, text: String(k.mistakes) },
    { key: "revisions", label: "Revisions", value: k.revisions, text: k.revisions === null ? "–" : String(k.revisions) },
    { key: "onTimePct", label: "On time", value: k.onTimePct, text: k.onTimePct === null ? "–" : `${k.onTimePct}%` },
  ];
  return rows.map((m) => ({ ...m, ok: meets(m.key, m.value, t) }));
}

// the moment a month starts in India
export const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00+05:30`);

export async function kpiTargets(): Promise<Targets> {
  const row = await prisma.appSetting.findUnique({ where: { key: KPI_TARGETS } });
  try {
    return { ...DEFAULT_TARGETS, ...JSON.parse(row?.value ?? "{}") };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export type DeliveredTask = KpiTask & { editorId: string; month: string; project: string | null; excluded: boolean };

// Everything the Performance pages score, for the editors (or one of them)
// over the `months` months up to and including `month`: what they
// delivered, with its stage history; what's been logged about them; and
// what they're on now.
export async function loadPerformance(month: string, months: number, editorId?: string) {
  const people = await prisma.user.findMany({
    where: { employment: { not: "former" }, ...(editorId ? { id: editorId } : {}) },
    include: { team: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
  const editors = people.filter((p) => displayTeam(p)?.slug === "editors");
  const ids = editors.map((e) => e.id);
  const first = shiftMonth(month, -(months - 1));
  const end = monthStart(shiftMonth(month, 1));

  const [delivered, entries, open] = await Promise.all([
    // updatedAt only ever moves forward, so this catches everything
    // delivered in the window, and a little more to sort out below
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, status: "delivered_and_uploaded", updatedAt: { gte: monthStart(first) } },
      select: {
        id: true,
        title: true,
        assignedToId: true,
        createdAt: true,
        updatedAt: true,
        dueDate: true,
        handedOffAt: true,
        kpiExcluded: true,
        tags: { select: { name: true } },
        project: { select: { name: true, type: true, client: { select: { name: true } } } },
      },
    }),
    prisma.performanceEntry.findMany({
      where: { editorId: { in: ids }, at: { gte: monthStart(first), lt: end } },
      include: { task: { select: { title: true } }, loggedBy: { select: { name: true } } },
      orderBy: { at: "desc" },
    }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, ...LIVE_TASK },
      select: { id: true, title: true, assignedToId: true, dueDate: true, status: true, project: { select: { name: true, type: true, client: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: delivered.map((t) => t.id) } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const movesOf = new Map<string, KpiTask["moves"]>();
  for (const l of logs) {
    const move = parseStageChange(l.action);
    if (move) movesOf.set(l.entityId, [...(movesOf.get(l.entityId) ?? []), { at: l.createdAt, from: move.from, to: move.to }]);
  }

  const tasks: DeliveredTask[] = delivered
    .map((t) => {
      const moves = movesOf.get(t.id) ?? [];
      // when it was last marked delivered, rather than when the row last changed
      const deliveredAt = moves.findLast((m) => m.to === "delivered_and_uploaded")?.at ?? t.updatedAt;
      return {
        id: t.id,
        title: t.title,
        client: t.project.client.name,
        project: t.project.name || t.project.type,
        createdAt: t.createdAt,
        deliveredAt,
        dueDate: t.dueDate,
        handedOffAt: t.handedOffAt,
        tags: t.tags.map((x) => x.name),
        moves,
        editorId: t.assignedToId!,
        month: indiaDay(deliveredAt).slice(0, 7),
        excluded: t.kpiExcluded,
      };
    })
    .filter((t) => t.month >= first && t.month <= month)
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime());

  const kpiEntries = entries.map((e) => ({ ...e, day: indiaDay(e.at) }));

  // One editor's (or the team's) month, ready for editorKpis. A mistake
  // Claude picked out of Frame.io counts once someone has confirmed it:
  // the sorting is a first pass, and a grade shouldn't rest on a guess.
  const slice = (ym: string, who?: string): [KpiTask[], KpiEntry[]] => [
    tasks.filter((t) => t.month === ym && !t.excluded && (!who || t.editorId === who)),
    kpiEntries.filter((e) => e.day.slice(0, 7) === ym && (!who || e.editorId === who) && (e.reviewed || e.kind !== "mistake")),
  ];

  return { editors, tasks, entries: kpiEntries, open, slice };
}
