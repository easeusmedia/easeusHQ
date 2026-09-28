import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { LIVE_TASK } from "@/lib/workflow";
import { parseStageChange } from "@/lib/stages";
import { daysInMonth, editorKpis, KPI_TARGETS, pastWeeks, shiftMonth, weekShare, withTargetDefaults, type KpiEntry, type KpiTask, type Kpis, type Part, type Targets } from "@/lib/editorKpi";

// ?month=, if it's a real month not in the future; this month otherwise
export function pickMonth(asked: string | undefined, thisMonth: string) {
  return asked && /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
}

// How much of a month the numbers cover: all of a past month; of the
// current one, the days gone so far — so output isn't judged against days
// that haven't happened.
export function monthShare(ym: string, today: string) {
  return ym === today.slice(0, 7) ? Number(today.slice(8, 10)) / daysInMonth(ym) : 1;
}

// the moment a month starts in India
export const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00+05:30`);

export async function kpiTargets(): Promise<Targets> {
  const row = await prisma.appSetting.findUnique({ where: { key: KPI_TARGETS } });
  try {
    return withTargetDefaults(JSON.parse(row?.value ?? "{}"));
  } catch {
    return withTargetDefaults({});
  }
}

export type DeliveredTask = KpiTask & { editorId: string; month: string; day: string; project: string | null; excluded: boolean };

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
        day: indiaDay(deliveredAt),
        excluded: t.kpiExcluded,
      };
    })
    .filter((t) => t.month >= first && t.month <= month)
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime());

  const kpiEntries = entries.map((e) => ({ ...e, day: indiaDay(e.at) }));

  // One editor's (or the team's) month, ready for editorKpis. A mistake
  // Claude picked out of Frame.io counts once someone has confirmed it:
  // the sorting is a first pass, and a grade shouldn't rest on a guess.
  // Days from and to (yyyy-mm-dd, both included) narrow it to part of the month.
  const slice = (ym: string, who?: string, days: { from?: string; to?: string } = {}): [KpiTask[], KpiEntry[]] => {
    const inside = (day: string) => day.startsWith(ym) && (!days.from || day >= days.from) && (!days.to || day <= days.to);
    return [
      tasks.filter((t) => inside(t.day) && !t.excluded && (!who || t.editorId === who)),
      kpiEntries.filter((e) => inside(e.day) && (!who || e.editorId === who) && (e.reviewed || e.kind !== "mistake")),
    ];
  };

  // any stretch of days, across months if need be (yyyy-mm-dd, inclusive)
  const between = (from: string, to: string, who?: string): [KpiTask[], KpiEntry[]] => [
    tasks.filter((t) => t.day >= from && t.day <= to && !t.excluded && (!who || t.editorId === who)),
    kpiEntries.filter((e) => e.day >= from && e.day <= to && (!who || e.editorId === who) && (e.reviewed || e.kind !== "mistake")),
  ];

  return { editors, tasks, entries: kpiEntries, open, slice, between };
}

// the number each part is read as, in its own terms, and what it aims for
export function partText(part: Part, k: Kpis): string {
  const v = k.parts[part].value;
  return v === null ? "–" : part === "deadlines" ? `${v}%` : String(v);
}
export const PART_NOTE: Record<Part, (target: number) => string> = {
  quality: (t) => `mistakes a video · aim ${t}`,
  deadlines: (t) => `on time · aim ${t}%`,
  revisions: (t) => `sent back a video · aim ${t}`,
  output: (t) => `weighted videos · aim ${t}`,
};

// The last four weeks (Monday to Sunday, by date), newest first, each scored
// on its own: its output judged against a week's share of the month's target.
// They end today, or on the last day of a past month being looked at.
export function recentWeeks(data: Awaited<ReturnType<typeof loadPerformance>>, month: string, today: string, targets: Targets, who?: string) {
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  return pastWeeks(monthEnd < today ? monthEnd : today).map((w) => ({ ...w, k: editorKpis(...data.between(w.from, w.to, who), targets, weekShare(w.days)) }));
}
