import { prisma } from "@/lib/prisma";
import { LIVE_TASK } from "@/lib/workflow";
import { dayOf } from "@/lib/editorKpi";
import { summarise } from "@/lib/videoScore";
import { loadVideoScoring, scoreVideos, type ScoredVideo } from "@/lib/videoScores";

export { loadVideoScoring };
export type { ScoredVideo };

// the mistake types, each with what it means and its points
export async function loadCategories() {
  return prisma.feedbackCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

// the moment a day starts in India
const startOf = (day: string) => new Date(`${day}T00:00:00+05:30`);

// The people whose work is graded: the Members in Production (the editors,
// a designer).
export async function loadEditors(editorId?: string) {
  return prisma.user.findMany({
    where: {
      employment: { not: "former" },
      role: "employee",
      OR: [{ team: { slug: "production" } }, { departments: { some: { slug: "production" } } }],
      ...(editorId ? { id: editorId } : {}),
    },
    include: { team: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
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
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  fromClient: boolean;
  source: string;
  by: string | null;
  repeat: boolean;
  snapshot: boolean;
  reviewed: boolean;
  // a mistake on no video in particular (the old Notion log) is shown, not
  // counted: only a video's mistakes score
  counted: boolean;
};

const ENTRY_SELECT = {
  id: true,
  editorId: true,
  kind: true,
  category: true,
  body: true,
  count: true,
  points: true,
  at: true,
  taskId: true,
  clientId: true,
  projectId: true,
  client: { select: { name: true } },
  project: { select: { name: true, type: true } },
  fromClient: true,
  source: true,
  by: true,
  reviewed: true,
  task: { select: { title: true } },
  loggedBy: { select: { name: true } },
  snapshot: { select: { entryId: true } },
} as const;

type EntryRecord = { id: string; editorId: string; kind: string; category: string | null; body: string; count: number; points: number | null; at: Date; taskId: string | null; clientId: string | null; projectId: string | null; client: { name: string } | null; project: { name: string; type: string } | null; fromClient: boolean; source: string; by: string | null; reviewed: boolean; task: { title: string } | null; loggedBy: { name: string } | null; snapshot: { entryId: string } | null };

// an entry as the lists show it
const toRow = (e: EntryRecord, repeated: Set<string>): FeedbackRow => ({
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
  clientId: e.clientId,
  clientName: e.client?.name ?? null,
  projectId: e.projectId,
  projectName: e.project ? e.project.name || e.project.type : null,
  fromClient: e.fromClient,
  source: e.source,
  by: e.by ?? e.loggedBy?.name ?? null,
  repeat: repeated.has(e.id),
  snapshot: !!e.snapshot,
  reviewed: e.reviewed,
  counted: e.kind !== "mistake" || !!e.taskId,
});

// One video's page: the video, scored, and everything said about it.
export async function loadVideo(taskId: string) {
  const [scored, entries, categories] = await Promise.all([
    scoreVideos({ taskIds: [taskId] }),
    prisma.performanceEntry.findMany({ where: { taskId }, select: ENTRY_SELECT, orderBy: { at: "desc" } }),
    loadCategories(),
  ]);
  const video = scored.videos[0];
  if (!video) return null;
  return { video, scoring: scored.scoring, categories, feedback: entries.map((e) => toRow(e, scored.repeated)) };
}

// Everything the Performance pages show, for the editors (or one of them)
// from `from` up to today: their videos, scored (lib/videoScores.ts), and
// everything said about their work.
export async function loadPerformance({ from, editorId }: { from: string; editorId?: string }) {
  const editors = await loadEditors(editorId);
  const ids = editors.map((e) => e.id);
  const [categories, scored, entries, open] = await Promise.all([
    loadCategories(),
    scoreVideos({ editorIds: ids, since: from }),
    prisma.performanceEntry.findMany({
      where: { editorId: { in: ids }, at: { gte: startOf(from) } },
      select: ENTRY_SELECT,
      orderBy: { at: "desc" },
    }),
    prisma.task.findMany({ where: { assignedToId: { in: ids }, ...LIVE_TASK }, select: { id: true, title: true, assignedToId: true } }),
  ]);
  const { scoring, videos, repeated } = scored;

  const feedback = entries.map((e) => toRow(e, repeated));

  // one editor's (or the team's) videos handed over in a stretch, not left out
  const videosIn = (from: string, to: string, who?: string) => videos.filter((v) => (!who || v.editorId === who) && !v.excluded && v.day !== null && v.day >= from && v.day <= to);
  const summary = (from: string, to: string, who?: string) => summarise(videosIn(from, to, who).map((v) => v.score), scoring);

  return { editors, scoring, categories, videos, feedback, open, videosIn, summary };
}

export type PerformanceData = Awaited<ReturnType<typeof loadPerformance>>;

// The first day anything was recorded about the editors (or one of them):
// where "All time" starts.
export async function firstDay(editorId?: string): Promise<string | undefined> {
  const ids = (await loadEditors(editorId)).map((e) => e.id);
  const [entry, task] = await Promise.all([
    prisma.performanceEntry.aggregate({ where: { editorId: { in: ids } }, _min: { at: true } }),
    prisma.task.aggregate({ where: { assignedToId: { in: ids } }, _min: { createdAt: true } }),
  ]);
  const days = [entry._min.at, task._min.createdAt].filter((d): d is Date => !!d).map(dayOf).sort();
  return days[0];
}

// Each type's mistakes, how many were repeats, and on how many videos,
// over a stretch, the most repeated first. Only a video's mistakes count.
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
