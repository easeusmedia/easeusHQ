import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseStageChange } from "./stages";
import { handoffUnknown } from "./due";
import { addDays, dayOf, repeats, REPEAT_DAYS } from "./editorKpi";
import { isLetter, scoreVideo, VIDEO_SCORING_KEY, withVideoScoringDefaults, type VideoScoring } from "./videoScore";

// The videos behind the Performance pages, read from the database and
// scored (lib/videoScore.ts does the maths), and the two scores kept on
// each task so any card or row can be tinted without working them out.

export async function loadVideoScoring(): Promise<VideoScoring> {
  const row = await prisma.appSetting.findUnique({ where: { key: VIDEO_SCORING_KEY } });
  try {
    return withVideoScoringDefaults(JSON.parse(row?.value ?? "{}"));
  } catch {
    return withVideoScoringDefaults({});
  }
}

// the moment a day starts in India
const startOf = (day: string) => new Date(`${day}T00:00:00+05:30`);

// Every video of these editors touched since `since` (and the tasks in
// `also`, however old), or just these tasks, each with what was said about
// it and its scores.
export async function scoreVideos(where: { taskIds?: string[]; editorIds?: string[]; since?: string; also?: string[] }) {
  const s = await loadVideoScoring();
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: where.editorIds ? { in: where.editorIds } : { not: null },
      ...(where.taskIds ? { id: { in: where.taskIds } } : {}),
      ...(where.since ? { OR: [{ updatedAt: { gte: startOf(where.since) } }, { id: { in: where.also ?? [] } }] } : {}),
    },
    select: {
      id: true,
      title: true,
      assignedToId: true,
      createdAt: true,
      scheduledFor: true,
      updatedAt: true,
      status: true,
      handedOffAt: true,
      kpiExcluded: true,
      inspectionGrade: true,
      inspectedAt: true,
      qualityScore: true,
      videoScore: true,
      tier: true,
      inspectedById: true,
      frameioLink: true,
      tags: { select: { name: true } },
      project: { select: { name: true, type: true, client: { select: { name: true } } } },
    },
  });
  const ids = tasks.map((t) => t.id);
  const editors = [...new Set(tasks.map((t) => t.assignedToId!))];
  const earliest = tasks.reduce((d, t) => (t.createdAt < d ? t.createdAt : d), new Date());

  const [logs, entries, types] = await Promise.all([
    prisma.activityLog.findMany({ where: { entity: "Task", entityId: { in: ids } }, select: { entityId: true, action: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    // the editors' mistakes back far enough to tell a repeat, and everything on these videos
    prisma.performanceEntry.findMany({
      where: { OR: [{ taskId: { in: ids } }, { editorId: { in: editors }, kind: "mistake", at: { gte: startOf(addDays(dayOf(earliest), -REPEAT_DAYS)) } }] },
      select: { id: true, taskId: true, editorId: true, kind: true, category: true, count: true, points: true, fromClient: true, at: true },
    }),
    prisma.feedbackCategory.findMany({ select: { name: true, points: true, repeats: true } }),
  ]);

  const movesOf = new Map<string, { at: Date; from: string; to: string }[]>();
  for (const l of logs) {
    const m = parseStageChange(l.action);
    if (m) movesOf.set(l.entityId, [...(movesOf.get(l.entityId) ?? []), { at: l.createdAt, from: m.from, to: m.to }]);
  }
  const typeOf = new Map(types.map((t) => [t.name, t]));
  const repeated = new Set<string>();
  for (const editor of editors) {
    const mine = entries.filter((e) => e.editorId === editor && e.kind === "mistake" && typeOf.get(e.category ?? "Others")?.repeats);
    for (const id of repeats(mine.map((e) => ({ id: e.id, category: e.category ?? "Others", taskId: e.taskId, at: e.at })))) repeated.add(id);
  }

  const videos = tasks.map((t) => {
    const moves = movesOf.get(t.id) ?? [];
    // one that came from Notion already with the client, with no moves seen here: it reached the client when it was handed off
    if (t.handedOffAt && !handoffUnknown(t.createdAt, t.handedOffAt) && !moves.some((m) => m.to !== "queued" && m.to !== "editing")) {
      moves.push({ at: t.handedOffAt, from: "sent_for_approval", to: "sent_for_client_approval" });
    }
    const said = entries.filter((e) => e.taskId === t.id);
    const score = scoreVideo(
      {
        title: t.title,
        tags: t.tags.map((x) => x.name),
        assignedAt: t.scheduledFor && t.scheduledFor > t.createdAt ? t.scheduledFor : t.createdAt,
        moves,
        grade: isLetter(t.inspectionGrade) ? t.inspectionGrade : null,
        entries: said.map((e) => ({ kind: e.kind, fromClient: e.fromClient, count: e.count, points: e.points, weight: typeOf.get(e.category ?? "Others")?.points ?? 2, repeat: repeated.has(e.id) })),
      },
      s
    );
    return {
      id: t.id,
      title: t.title,
      editorId: t.assignedToId!,
      client: t.project.client.name,
      project: t.project.name || t.project.type,
      status: t.status,
      frameioLink: t.frameioLink,
      excluded: t.kpiExcluded,
      inspectedAt: t.inspectedAt,
      inspectedById: t.inspectedById,
      // what's kept on the task now, to write only what changed
      stored: { quality: t.qualityScore, overall: t.videoScore, tier: t.tier },
      // the day the editor handed it over: which period it belongs to
      day: score.efficiency.sentAt ? dayOf(score.efficiency.sentAt) : null,
      score,
    };
  });
  return { scoring: s, videos, repeated };
}

export type ScoredVideo = Awaited<ReturnType<typeof scoreVideos>>["videos"][number];

// Recompute and keep the scores of these tasks: just them after a move or
// a grade, so the card's colour is there as soon as the move is; with
// `wide`, their editors' recent videos too, after a change to what was
// said (a mistake on one can make a later one a repeat). One statement for
// all of it, only what changed, and raw, so each task's updatedAt stays
// put: History reads it as when the work last moved.
export async function refreshVideoScores(taskIds: (string | null | undefined)[], { wide = false } = {}) {
  const ids = [...new Set(taskIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  let videos: ScoredVideo[];
  if (wide) {
    const editors = (await prisma.task.findMany({ where: { id: { in: ids } }, select: { assignedToId: true } })).map((t) => t.assignedToId).filter((x): x is string => !!x);
    if (!editors.length) return;
    videos = (await scoreVideos({ editorIds: [...new Set(editors)], since: addDays(dayOf(new Date()), -REPEAT_DAYS * 2), also: ids })).videos;
  } else {
    videos = (await scoreVideos({ taskIds: ids })).videos;
  }
  const changed = videos
    .map((v) => ({ id: v.id, quality: v.score.quality.score, overall: v.score.overall, tier: v.score.letter.quality === "S" || v.score.letter.quality === "A+" ? v.score.letter.quality : null, stored: v.stored }))
    .filter((v) => v.quality !== v.stored.quality || v.overall !== v.stored.overall || v.tier !== v.stored.tier);
  if (!changed.length) return;
  const rows = Prisma.join(changed.map((v) => Prisma.sql`(${v.id}, ${v.quality}::double precision, ${v.overall}::double precision, ${v.tier}::text)`));
  await prisma.$executeRaw`UPDATE "Task" AS t SET "qualityScore" = v.quality, "videoScore" = v.overall, "tier" = v.tier FROM (VALUES ${rows}) AS v(id, quality, overall, tier) WHERE t.id = v.id`;
}

// Everyone's recent videos, after a change that touches them all: the
// scoring settings, or a mistake type's points.
export async function refreshAllVideoScores() {
  const recent = await prisma.task.findMany({
    where: { assignedToId: { not: null }, updatedAt: { gte: startOf(addDays(dayOf(new Date()), -REPEAT_DAYS * 2)) } },
    select: { id: true },
  });
  await refreshVideoScores(recent.map((t) => t.id), { wide: true });
}
