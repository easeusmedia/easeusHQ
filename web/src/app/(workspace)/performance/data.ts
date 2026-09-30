import { prisma } from "@/lib/prisma";
import { handoffUnknown } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { LIVE_TASK } from "@/lib/workflow";
import { parseStageChange } from "@/lib/stages";
import { addDays, dayOf, repeats, REPEAT_DAYS, SCORING_KEY, scorePeriod, videoFacts, withScoringDefaults, workingDaysIn, type Kpis, type Scoring } from "@/lib/editorKpi";

export async function loadScoring(): Promise<Scoring> {
  const row = await prisma.appSetting.findUnique({ where: { key: SCORING_KEY } });
  try {
    return withScoringDefaults(JSON.parse(row?.value ?? "{}"));
  } catch {
    return withScoringDefaults({});
  }
}

export async function loadCategories() {
  return prisma.feedbackCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

// the moment a day starts in India
const startOf = (day: string) => new Date(`${day}T00:00:00+05:30`);

// The editors: everyone on the team who edits (Operations, not core).
export async function loadEditors(editorId?: string) {
  const people = await prisma.user.findMany({
    where: { employment: { not: "former" }, ...(editorId ? { id: editorId } : {}) },
    include: { team: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
  return people.filter((p) => displayTeam(p)?.slug === "editors");
}

export type FeedbackRow = {
  id: string;
  editorId: string;
  kind: string;
  category: string | null;
  body: string;
  count: number;
  points: number | null;
  day: string;
  at: string;
  taskId: string | null;
  taskTitle: string | null;
  fromClient: boolean;
  source: string;
  by: string | null;
  repeat: boolean;
  snapshot: boolean;
  reviewed: boolean;
  // a mistake about no video in particular, from before their work was
  // tracked here (the old Notion log), is shown, not counted: it would be
  // weighed against videos that aren't here
  counted: boolean;
};

// Everything the Performance pages score, for the editors (or one of them)
// from `from` up to today: what they completed, each video's stage
// history, the feedback on their work (with which of it repeats an earlier
// mistake), core's own feedback, and their leave.
export async function loadPerformance({ from, editorId }: { from: string; editorId?: string }) {
  const editors = await loadEditors(editorId);
  const ids = editors.map((e) => e.id);
  const since = startOf(from);
  // far enough back to tell whether the first mistakes in view repeat older ones
  const lookback = startOf(addDays(from, -REPEAT_DAYS));

  const [scoring, categories, tasks, entries, leave, open, firsts] = await Promise.all([
    loadScoring(),
    loadCategories(),
    // updatedAt only moves forward, so this catches everything completed since `from`
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, updatedAt: { gte: since } },
      select: {
        id: true,
        title: true,
        assignedToId: true,
        createdAt: true,
        scheduledFor: true,
        updatedAt: true,
        status: true,
        dueDate: true,
        handedOffAt: true,
        kpiExcluded: true,
        tags: { select: { name: true } },
        project: { select: { name: true, type: true, client: { select: { name: true } } } },
      },
    }),
    prisma.performanceEntry.findMany({
      where: { editorId: { in: ids }, at: { gte: lookback } },
      select: {
        id: true,
        editorId: true,
        kind: true,
        category: true,
        body: true,
        count: true,
        points: true,
        at: true,
        taskId: true,
        fromClient: true,
        source: true,
        by: true,
        reviewed: true,
        task: { select: { title: true } },
        loggedBy: { select: { name: true } },
        snapshot: { select: { entryId: true } },
      },
      orderBy: { at: "desc" },
    }),
    prisma.leaveDay.findMany({ where: { editorId: { in: ids } }, orderBy: { day: "desc" } }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, ...LIVE_TASK },
      select: { id: true, title: true, assignedToId: true, dueDate: true, handedOffAt: true },
    }),
    // when each editor's work started being tracked here
    prisma.task.groupBy({ by: ["assignedToId"], where: { assignedToId: { in: ids } }, _min: { createdAt: true } }),
  ]);

  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: tasks.map((t) => t.id) } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const movesOf = new Map<string, { at: Date; from: string; to: string }[]>();
  for (const l of logs) {
    const move = parseStageChange(l.action);
    if (move) movesOf.set(l.entityId, [...(movesOf.get(l.entityId) ?? []), { at: l.createdAt, from: move.from, to: move.to }]);
  }
  const leaveOf = new Map<string, Set<string>>();
  for (const l of leave) leaveOf.set(l.editorId, new Set([...(leaveOf.get(l.editorId) ?? []), l.day]));
  const trackedFrom = new Map(firsts.map((f) => [f.assignedToId!, f._min.createdAt ? dayOf(f._min.createdAt) : null]));

  const videos = tasks.map((t) => {
    const moves = movesOf.get(t.id) ?? [];
    const assignedAt = t.scheduledFor && t.scheduledFor > t.createdAt ? t.scheduledFor : t.createdAt;
    const delivered = moves.findLast((m) => m.to === "delivered_and_uploaded")?.at ?? (t.status === "delivered_and_uploaded" ? t.updatedAt : null);
    return {
      ...videoFacts(
        {
          id: t.id,
          title: t.title,
          client: t.project.client.name,
          createdAt: t.createdAt,
          assignedAt,
          // one that arrived from Notion already past the client: nobody saw it get there
          handedOffAt: t.handedOffAt && !handoffUnknown(t.createdAt, t.handedOffAt) ? t.handedOffAt : null,
          deliveredAt: delivered,
          dueDate: t.dueDate,
          tags: t.tags.map((x) => x.name),
          moves,
        },
        scoring,
        leaveOf.get(t.assignedToId!) ?? new Set()
      ),
      editorId: t.assignedToId!,
      project: t.project.name || t.project.type,
      excluded: t.kpiExcluded,
    };
  });

  // which feedback points repeat an earlier mistake, editor by editor, in
  // the categories where a repeat counts
  const repeatable = new Set(categories.filter((c) => c.repeats).map((c) => c.name));
  const repeated = new Set<string>();
  for (const id of ids) {
    const mine = entries.filter((e) => e.editorId === id && e.kind === "mistake" && repeatable.has(e.category ?? "Others"));
    for (const r of repeats(mine.map((e) => ({ id: e.id, category: e.category ?? "Others", taskId: e.taskId, at: e.at })))) repeated.add(r);
  }
  const weightOf = new Map(categories.map((c) => [c.name, c.weight]));
  const feedback: FeedbackRow[] = entries
    .filter((e) => e.at >= since)
    .map((e) => ({
      id: e.id,
      editorId: e.editorId,
      kind: e.kind,
      category: e.category,
      body: e.body,
      count: e.count,
      points: e.points,
      day: dayOf(e.at),
      at: e.at.toISOString(),
      taskId: e.taskId,
      taskTitle: e.task?.title ?? null,
      fromClient: e.fromClient,
      source: e.source,
      by: e.by ?? e.loggedBy?.name ?? null,
      repeat: repeated.has(e.id),
      snapshot: !!e.snapshot,
      reviewed: e.reviewed,
      counted: e.kind !== "mistake" || !!e.taskId || dayOf(e.at) >= (trackedFrom.get(e.editorId) ?? ""),
    }));

  const today = dayOf(new Date());

  // One editor's (or, with no one given, the team's) stretch of days,
  // scored. Their leave comes off the working days the output target
  // counts, which start when their work started being tracked here; a
  // stretch running to today counts today for the share gone.
  const score = (from: string, to: string, who?: string): Kpis => {
    const mine = (id: string) => !who || id === who;
    const now = to >= today ? new Date() : undefined;
    return scorePeriod(
      {
        videos: videos.filter((v) => mine(v.editorId) && !v.excluded && v.completedDay && v.completedDay >= from && v.completedDay <= to),
        entries: feedback
          .filter((e) => mine(e.editorId) && e.day >= from && e.day <= to && e.counted)
          .map((e) => ({ kind: e.kind, category: e.category, count: e.count, points: e.points, weight: weightOf.get(e.category ?? "") ?? 1, repeat: e.repeat })),
        workDays: editors
          .filter((p) => mine(p.id))
          .reduce((n, p) => {
            const tracked = trackedFrom.get(p.id);
            return tracked && tracked <= to ? n + workingDaysIn(tracked > from ? tracked : from, to, scoring, leaveOf.get(p.id) ?? new Set(), now) : n;
          }, 0),
      },
      scoring
    );
  };

  return { editors, scoring, categories, today, videos, feedback, leave, open, score };
}

export type PerformanceData = Awaited<ReturnType<typeof loadPerformance>>;

// Each category's mistakes, how many were repeats, and the last time, over
// a stretch: the repeated mistakes, most first.
export function repeatedMistakes(feedback: FeedbackRow[], from: string, to: string, who: string) {
  const by = new Map<string, { count: number; repeats: number; videos: Set<string>; last: string }>();
  for (const e of feedback) {
    if (e.editorId !== who || e.kind !== "mistake" || !e.counted || e.day < from || e.day > to) continue;
    const c = by.get(e.category ?? "Others") ?? { count: 0, repeats: 0, videos: new Set<string>(), last: e.day };
    c.count += e.count;
    if (e.repeat) c.repeats += e.count;
    c.videos.add(e.taskId ?? e.id);
    if (e.day > c.last) c.last = e.day;
    by.set(e.category ?? "Others", c);
  }
  return [...by.entries()]
    .map(([category, c]) => ({ category, count: c.count, repeats: c.repeats, videos: c.videos.size, last: c.last }))
    .sort((a, b) => b.repeats - a.repeats || b.count - a.count);
}
