"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireOps } from "@/lib/auth";

// grading and feedback are a Founder's (lib/scope)
async function requireFounder() {
  const me = await requireOps();
  return me?.role === "admin" ? me : null;
}
import { canEditPeople } from "@/lib/scope";
import { isLetter, LETTERS, VIDEO_SCORING_KEY, withVideoScoringDefaults, type VideoScoring } from "@/lib/videoScore";
import { refreshAllVideoScores, refreshVideoScores } from "@/lib/videoScores";
import { aiSortEntries, syncFrameioFeedback } from "@/lib/frameioFeedback";

type Result = { error?: string };

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};
const done = () => revalidatePath("/performance", "layout");

// ---------- scoring ----------

// How a video is scored (lib/videoScore.ts): the letters' bands, what each
// inspection grade starts at, the three parts' weights, and every point
// each part gives or takes. Admin only; every video is rescored.
export async function saveScoring(input: VideoScoring): Promise<Result> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only a Founder can change the scoring." };

  const s = withVideoScoringDefaults({});
  const numbers = (from: Record<string, unknown> | undefined, keys: string[], min: number, max: number) => {
    const out: Record<string, number> = {};
    for (const k of keys) {
      const n = num(from?.[k], min, max);
      if (n === null) return null;
      out[k] = n;
    }
    return out;
  };
  const bands = numbers(input.bands, ["S", "A+", "A", "B", "C"], 0, 100);
  if (!bands || !(bands.S > bands["A+"] && bands["A+"] > bands.A && bands.A > bands.B && bands.B > bands.C)) return { error: "Each letter needs a lower score than the one above it." };
  const base = numbers(input.base, [...LETTERS], 0, 100);
  if (!base) return { error: "Each grade starts between 0 and 100." };
  const weights = numbers(input.weights, ["quality", "efficiency", "client"], 0, 100);
  if (!weights || weights.quality + weights.efficiency + weights.client <= 0) return { error: "The three weights can't all be 0." };
  s.bands = bands as VideoScoring["bands"];
  s.base = base as VideoScoring["base"];
  s.weights = weights as VideoScoring["weights"];
  const single: [keyof VideoScoring, number, number][] = [
    ["mistakeCap", 0, 100],
    ["repeatMultiplier", 1, 10],
    ["praisePoints", 0, 50],
    ["concernPoints", 0, 50],
    ["cutoffHour", 0, 24],
    ["lateDay", 0, 100],
    ["revision", 0, 100],
    ["lateRevisionDay", 0, 100],
    ["clientCreative", 0, 100],
    ["clientMistake", 0, 100],
  ];
  for (const [key, min, max] of single) {
    const n = num(input[key], min, max);
    if (n === null) return { error: "One of those numbers isn't sensible." };
    (s as Record<string, unknown>)[key] = n;
  }
  const days = [...new Set((input.workDays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { error: "Pick at least one working day." };
  s.workDays = days;
  s.types = {};
  for (const [kind, rule] of Object.entries(input.types ?? {})) {
    const extra = num(rule?.days, 0, 30);
    if (extra === null || !kind.trim()) return { error: "Each type needs its extra days, 0 or more." };
    s.types[kind.trim()] = { days: extra };
  }
  if (!Object.keys(s.types).length) return { error: "Keep at least one type of work." };
  s.creativeWords = String(input.creativeWords ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .join(", ");
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: VIDEO_SCORING_KEY }, create: { key: VIDEO_SCORING_KEY, value }, update: { value } });
  await refreshAllVideoScores();
  done();
  return {};
}

// A video's grade from the quality inspection, set or changed after the
// move that first asked for it (or cleared). Core only.
export async function setGrade(taskId: string, grade: string | null): Promise<Result> {
  const me = await requireFounder();
  if (!me) return { error: "Only a Founder can grade videos." };
  if (grade !== null && !isLetter(grade)) return { error: "Pick S, A+, A, B, C or D." };
  // raw, so updatedAt (which History reads as when the work last moved) stays put
  await prisma.$executeRaw`UPDATE "Task" SET "inspectionGrade" = ${grade}, "inspectedAt" = ${grade ? new Date() : null}, "inspectedById" = ${grade ? me.id : null} WHERE id = ${taskId}`;
  await refreshVideoScores([taskId]);
  done();
  revalidatePath("/board");
  return {};
}

// ---------- mistake types ----------

type CategoryInput = { name: string; description: string; points: number; keywords: string; repeats: boolean };
const cleanCategory = (input: CategoryInput) => {
  const name = input.name.trim();
  if (!name) return { error: "Give it a name." };
  // the Quality points one takes off a video
  const points = num(input.points, 0, 50);
  if (points === null) return { error: "Points off should be between 0 and 50." };
  const keywords = input.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(", ");
  return { data: { name, description: input.description.trim() || null, points, keywords: keywords || null, repeats: !!input.repeats } };
};

// A type of mistake, for sorting Frame.io comments into. Core only.
export async function addCategory(input: CategoryInput): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change the types." };
  const c = cleanCategory(input);
  if ("error" in c) return c;
  if (await prisma.feedbackCategory.findUnique({ where: { name: c.data.name } })) return { error: "There's already a type with that name." };
  const last = await prisma.feedbackCategory.aggregate({ _max: { sortOrder: true } });
  await prisma.feedbackCategory.create({ data: { ...c.data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await refreshAllVideoScores();
  done();
  return {};
}

// Renaming carries every mistake filed under it along.
export async function updateCategory(id: string, input: CategoryInput): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change the types." };
  const before = await prisma.feedbackCategory.findUnique({ where: { id } });
  if (!before) return { error: "That type is gone." };
  const c = cleanCategory(input);
  if ("error" in c) return c;
  if (before.name === "Others" && c.data.name !== "Others") return { error: "Others stays: it's where anything unsorted goes." };
  if (c.data.name !== before.name && (await prisma.feedbackCategory.findUnique({ where: { name: c.data.name } }))) return { error: "There's already a type with that name." };
  await prisma.$transaction([
    prisma.feedbackCategory.update({ where: { id }, data: c.data }),
    prisma.performanceEntry.updateMany({ where: { category: before.name, kind: "mistake" }, data: { category: c.data.name } }),
  ]);
  await refreshAllVideoScores();
  done();
  return {};
}

// Its mistakes move to Others.
export async function deleteCategory(id: string): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change the types." };
  const before = await prisma.feedbackCategory.findUnique({ where: { id } });
  if (!before) return {};
  if (before.name === "Others") return { error: "Others stays: it's where anything unsorted goes." };
  await prisma.$transaction([
    prisma.performanceEntry.updateMany({ where: { category: before.name, kind: "mistake" }, data: { category: "Others" } }),
    prisma.feedbackCategory.delete({ where: { id } }),
  ]);
  await refreshAllVideoScores();
  done();
  return {};
}

// ---------- feedback ----------

// Sort with AI: only when core clicks it. Claude re-sorts the Frame.io
// comments given that nobody has sorted by hand.
export async function sortWithAi(ids: string[]): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can re-sort feedback." };
  try {
    await aiSortEntries(ids.slice(0, 200));
    const tasks = await prisma.performanceEntry.findMany({ where: { id: { in: ids } }, select: { taskId: true } });
    await refreshVideoScores(tasks.map((t) => t.taskId), { wide: true });
    done();
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Claude couldn't sort them just now." };
  }
}

export type EntryInput = {
  editorId: string;
  // mistake | creative (a change for that video only, never counted) |
  // positive (praise) | negative (a concern) | guidance (a tip for the
  // future, never scored)
  kind: string;
  // a mistake's type
  category: string;
  body: string;
  count: number;
  // praise and concerns: how many points they add or take off, required
  points: number | null;
  // from the client stage: counts against Client acceptance, not Quality
  fromClient: boolean;
  day: string; // yyyy-mm-dd
  taskId: string;
  clientId: string;
  projectId: string;
};

async function clean(input: EntryInput, frameioPraise = false) {
  if (!["mistake", "creative", "positive", "negative", "guidance"].includes(input.kind)) return { error: "Pick what kind of feedback this is." };
  const body = input.body.trim();
  if (!body) return { error: "Write what it was about." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Pick the day it happened." };
  const mistake = input.kind === "mistake";
  const scored = input.kind === "positive" || input.kind === "negative";
  const count = Math.round(Number(input.count));
  if (mistake && (!Number.isFinite(count) || count < 1 || count > 99)) return { error: "Times should be between 1 and 99." };
  // Frame.io praise can stay at the usual amount; anything else needs its points
  const usual = frameioPraise && input.kind === "positive" && input.points === null;
  const points = scored && !usual ? num(input.points, 0.5, 50) : null;
  if (scored && !usual && points === null) return { error: `Give it points: how much it ${input.kind === "positive" ? "adds" : "takes off"}.` };
  const project = input.projectId ? await prisma.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } }) : null;
  if (input.projectId && !project) return { error: "That project is gone." };
  return {
    data: {
      kind: input.kind,
      category: mistake ? input.category.trim() || "Others" : null,
      body,
      count: mistake ? count : 1,
      points: scored ? points : null,
      // midday in India, so the day never slips either way
      at: new Date(`${input.day}T12:00:00+05:30`),
      taskId: input.taskId || null,
      clientId: project?.clientId ?? (input.clientId || null),
      projectId: input.projectId || null,
      fromClient: !!input.fromClient,
    },
  };
}

// Written in by core: a mistake, a creative change, praise, a concern, or a tip.
export async function logEntry(input: EntryInput): Promise<Result> {
  const me = await requireFounder();
  if (!me) return { error: "Only a Founder can add feedback." };
  const c = await clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.create({ data: { ...c.data, editorId: input.editorId, source: "manual", by: me.name, loggedById: me.id, reviewed: true } });
  await refreshVideoScores([c.data.taskId], { wide: true });
  done();
  return {};
}

// Anything can be put right, whether it came from Frame.io, Notion or a person.
export async function updateEntry(id: string, input: EntryInput): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change feedback." };
  const before = await prisma.performanceEntry.findUnique({ where: { id }, select: { source: true, taskId: true } });
  if (!before) return { error: "That feedback is gone." };
  const c = await clean(input, before.source === "frameio");
  if ("error" in c) return c;
  await prisma.performanceEntry.update({ where: { id }, data: { ...c.data, reviewed: true } });
  // it may have moved from one video to another
  await refreshVideoScores([before.taskId, c.data.taskId], { wide: true });
  done();
  return {};
}

// A mistake that was really a creative change for that video (or back):
// one click, and it stops (or starts) counting. Its type is kept, so it
// goes back where it was.
export async function setCreative(id: string, creative: boolean): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change feedback." };
  const e = await prisma.performanceEntry.findUnique({ where: { id }, select: { category: true, taskId: true } });
  if (!e) return { error: "That's gone." };
  await prisma.performanceEntry.update({ where: { id }, data: { kind: creative ? "creative" : "mistake", category: e.category ?? "Others", reviewed: true } });
  await refreshVideoScores([e.taskId], { wide: true });
  done();
  return {};
}

export async function deleteEntry(id: string): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can remove feedback." };
  const gone = await prisma.performanceEntry.delete({ where: { id }, select: { taskId: true } });
  await refreshVideoScores([gone.taskId], { wide: true });
  done();
  return {};
}

// The Sync button: new Frame.io review comments, sorted, with snapshots.
export async function syncFeedback(): Promise<Result & { added?: number; mistakes?: number; snapshots?: number }> {
  if (!(await requireFounder())) return { error: "Only a Founder can sync feedback." };
  try {
    const res = await syncFrameioFeedback();
    done();
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Frame.io couldn't be reached." };
  }
}

// ---------- videos ----------

// A video left out of (or put back into) the editor's numbers.
export async function setTaskExcluded(taskId: string, excluded: boolean): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change what counts." };
  // raw, so the task's updatedAt stays put: History and these numbers read
  // it as when the work was delivered, where the stage log doesn't say
  await prisma.$executeRaw`UPDATE "Task" SET "kpiExcluded" = ${excluded} WHERE id = ${taskId}`;
  done();
  return {};
}

// A video's type, put right: it sets the standard its speed is judged by and
// what it counts for in output.
export async function setTaskType(taskId: string, type: string): Promise<Result> {
  if (!(await requireFounder())) return { error: "Only a Founder can change a video's type." };
  const tag = await prisma.taskTag.findUnique({ where: { name: type }, select: { id: true } });
  if (!tag) return { error: "That type doesn't exist." };
  const before = await prisma.task.findUnique({ where: { id: taskId }, select: { updatedAt: true } });
  if (!before) return { error: "That video is gone." };
  await prisma.task.update({ where: { id: taskId }, data: { tags: { set: [{ id: tag.id }] } } });
  // keep updatedAt where it was: History and these numbers read it as when
  // the work last moved
  await prisma.$executeRaw`UPDATE "Task" SET "updatedAt" = ${before.updatedAt} WHERE id = ${taskId}`;
  await refreshVideoScores([taskId]);
  done();
  return {};
}
