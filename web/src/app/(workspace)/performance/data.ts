import { prisma } from "@/lib/prisma";
import { handoffUnknown } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { LIVE_TASK } from "@/lib/workflow";
import { parseStageChange } from "@/lib/stages";
import {
  dayOf,
  issueStatus,
  KPI_TARGETS,
  scorePeriod,
  shortDay,
  videoFacts,
  withTargetDefaults,
  workingDaysIn,
  type KpiEntry,
  type Kpis,
  type Mark,
  type Targets,
  type Video,
} from "@/lib/editorKpi";

export async function kpiTargets(): Promise<Targets> {
  const row = await prisma.appSetting.findUnique({ where: { key: KPI_TARGETS } });
  try {
    return withTargetDefaults(JSON.parse(row?.value ?? "{}"));
  } catch {
    return withTargetDefaults({});
  }
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

const SENT = ["sent_for_approval", "sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

export type IssueRow = {
  id: string;
  editorId: string;
  title: string;
  category: string | null;
  note: string | null;
  auto: boolean;
  openedDay: string;
  resolvedDay: string | null;
  reopens: number;
  count: number;
  videos: number;
  lastSeen: string | null;
  looksFixed: boolean;
};

// Everything the Performance pages score, for the editors (or one of them)
// from `from` up to today: what they were given and completed, each video's
// stage history, what's been said about their work, their leave, their
// issue queue, and what they're on now.
export async function loadPerformance({ from, editorId }: { from: string; editorId?: string }) {
  const editors = await loadEditors(editorId);
  const ids = editors.map((e) => e.id);
  const since = startOf(from);

  const [tasks, entries, marks, issues, leave, open, firsts] = await Promise.all([
    // updatedAt only moves forward, so this catches everything completed
    // or given to them since `from`
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
      where: { editorId: { in: ids }, at: { gte: since } },
      include: { task: { select: { title: true } }, loggedBy: { select: { name: true } } },
      orderBy: { at: "desc" },
    }),
    // every confirmed mistake, for how the issue queue stands
    prisma.performanceEntry.findMany({
      where: { editorId: { in: ids }, kind: "mistake", reviewed: true },
      select: { editorId: true, category: true, taskId: true, at: true, count: true },
    }),
    prisma.focusArea.findMany({ where: { editorId: { in: ids } }, orderBy: { openedAt: "asc" } }),
    prisma.leaveDay.findMany({ where: { editorId: { in: ids } }, orderBy: { day: "asc" } }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, ...LIVE_TASK },
      select: { id: true, title: true, assignedToId: true, dueDate: true, status: true, handedOffAt: true },
      orderBy: { dueDate: "asc" },
    }),
    // when each editor's work started being tracked here
    prisma.task.groupBy({ by: ["assignedToId"], where: { assignedToId: { in: ids } }, _min: { createdAt: true } }),
  ]);
  const trackedFrom = new Map(firsts.map((f) => [f.assignedToId!, f._min.createdAt ? dayOf(f._min.createdAt) : null]));

  // stage history for these videos, and for the ones feedback is about
  const taskIds = [...new Set([...tasks.map((t) => t.id), ...entries.map((e) => e.taskId).filter((x): x is string => !!x)])];
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: taskIds } },
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

  const targets = await kpiTargets();
  const videos = tasks.map((t) => {
    const moves = movesOf.get(t.id) ?? [];
    const assignedAt = t.scheduledFor && t.scheduledFor > t.createdAt ? t.scheduledFor : t.createdAt;
    const delivered = moves.findLast((m) => m.to === "delivered_and_uploaded")?.at ?? (t.status === "delivered_and_uploaded" ? t.updatedAt : null);
    const facts = videoFacts(
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
      targets,
      leaveOf.get(t.assignedToId!) ?? new Set()
    );
    return {
      ...facts,
      editorId: t.assignedToId!,
      project: t.project.name || t.project.type,
      assignedDay: dayOf(assignedAt),
      excluded: t.kpiExcluded,
    };
  });

  // Feedback, with whether it's been dealt with. A Frame.io comment still
  // unticked after the video was sent on again was passed over.
  const rows = entries.map((e) => {
    const day = dayOf(e.at);
    // the old Notion review is a record of what happened, with nothing to tick off
    const resolved = e.resolvedAt !== null || e.kind === "praise" || e.kind === "note" || e.source === "notion";
    const movedOn = !!e.taskId && (movesOf.get(e.taskId) ?? []).some((m) => m.at > e.at && SENT.includes(m.to));
    return {
      id: e.id,
      editorId: e.editorId,
      kind: e.kind,
      category: e.category,
      body: e.body,
      count: e.count,
      day,
      taskId: e.taskId,
      taskTitle: e.task?.title ?? null,
      fromClient: e.fromClient,
      reviewed: e.reviewed || e.kind !== "mistake",
      source: e.source,
      by: e.by ?? e.loggedBy?.name ?? null,
      resolved,
      stale: e.source === "frameio" && !resolved && movedOn,
    };
  });

  const markRows = marks.map((m) => ({ editorId: m.editorId, category: m.category ?? "Others", taskId: m.taskId, day: dayOf(m.at), count: m.count }));
  const today = dayOf(new Date());
  const issueRows: IssueRow[] = issues.map((i) => {
    const openedDay = dayOf(i.openedAt);
    return {
      id: i.id,
      editorId: i.editorId,
      title: i.title,
      category: i.category,
      note: i.note,
      auto: i.auto,
      openedDay,
      resolvedDay: i.resolvedAt ? dayOf(i.resolvedAt) : null,
      reopens: i.reopens,
      ...issueStatus(
        { category: i.category, openedDay, reopenedDay: i.reopenedAt ? dayOf(i.reopenedAt) : null },
        markRows.filter((m) => m.editorId === i.editorId) as Mark[],
        today
      ),
    };
  });

  // One editor's (or, with no one given, the team's) stretch of days,
  // scored. Their leave comes off the working days the output target
  // counts; a stretch running to today counts today for the share gone.
  const score = (from: string, to: string, who?: string): Kpis => {
    const mine = (id: string) => !who || id === who;
    const now = to >= today ? new Date() : undefined;
    const people = editors.filter((e) => mine(e.id));
    return scorePeriod(
      {
        videos: videos.filter((v) => mine(v.editorId) && !v.excluded && v.completedDay && v.completedDay >= from && v.completedDay <= to) as Video[],
        entries: rows.filter((e) => mine(e.editorId) && e.day >= from && e.day <= to) as KpiEntry[],
        assigned: videos.filter((v) => mine(v.editorId) && v.assignedDay >= from && v.assignedDay <= to).length,
        openIssues: issueRows.filter((i) => mine(i.editorId) && i.openedDay <= to && (!i.resolvedDay || i.resolvedDay > to)).length,
        // counted from when their work started being tracked here, not before
        workDays: people.reduce((n, p) => {
          const since = trackedFrom.get(p.id);
          return since && since <= to ? n + workingDaysIn(since > from ? since : from, to, targets, leaveOf.get(p.id) ?? new Set(), now) : n;
        }, 0),
      },
      targets
    );
  };

  return { editors, targets, today, videos, entries: rows, issues: issueRows, leave, open, score };
}

export type PerformanceData = Awaited<ReturnType<typeof loadPerformance>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What core should help with, most pressing first, at most three: the
// issues that keep coming back, a kind of video taking longer than it
// should, feedback passed over, output well short, a lot of back and forth.
export function needsHelp(k: Kpis, issues: IssueRow[], t: Targets): { title: string; detail: string }[] {
  const out: { title: string; detail: string }[] = [];
  const perDay = t.dayEnd - t.dayStart;
  for (const i of issues
    .filter((i) => !i.resolvedDay)
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || b.count - a.count)
    .slice(0, 2)) {
    out.push({
      title: i.title,
      detail: i.category
        ? i.count
          ? `${plural(i.count, "time")} on ${plural(i.videos, "video")} since ${shortDay(i.openedDay)}, last on ${shortDay(i.lastSeen!)}`
          : `Open since ${shortDay(i.openedDay)}, not seen since`
        : `Raised ${shortDay(i.openedDay)}${i.note ? `: ${i.note}` : ""}`,
    });
  }
  const slow = k.byType.find((x) => x.timed >= 2 && x.onStandardPct !== null && x.onStandardPct < t.onStandardPct && x.editHours !== null);
  if (slow)
    out.push({
      title: `${slow.type}s take longer than they should`,
      detail: `${Math.round((slow.editHours! / perDay) * 10) / 10} working days on average, against ${Math.round((slow.standardHours / perDay) * 10) / 10}`,
    });
  if (k.stale) out.push({ title: "Feedback passed over", detail: `${plural(k.stale, "Frame.io comment")} still unticked after the video was sent on` });
  if (k.parts.output.points !== null && k.parts.output.points < 70)
    out.push({ title: "Output is short", detail: `${k.units} of ${k.outputTarget} reel-equivalents for the working days so far` });
  if (k.revisions !== null && k.revisions > t.revisions * 1.5) out.push({ title: "A lot of back and forth", detail: `Sent back ${k.revisions} times a video, against ${t.revisions}` });
  return out.slice(0, 3);
}

// "Improving" or "Slipping" against the period before, when both are graded
export function trend(now: number | null, before: number | null): { delta: number } | null {
  return now === null || before === null ? null : { delta: now - before };
}
