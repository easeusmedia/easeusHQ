"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { SCORING_KEY, withScoringDefaults, type Scoring } from "@/lib/editorKpi";
import { aiSortEntries, syncFrameioFeedback } from "@/lib/frameioFeedback";

type Result = { error?: string };

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};
const done = () => revalidatePath("/performance", "layout");

// ---------- scoring ----------

// How the score is worked out: the working week, reels a day, each type's
// standard and what it counts for, how Quantity splits, what a mistake,
// revision and repeat cost Quality, and where Feedback starts. Admin only.
export async function saveScoring(input: Scoring): Promise<Result> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the scoring." };

  const s = withScoringDefaults({});
  const checks: [keyof Scoring, number, number][] = [
    ["reelsPerDay", 0.1, 50],
    ["volumePoints", 0, 5],
    ["mistakePoints", 0, 5],
    ["revisionWeight", 0, 10],
    ["repeatWeight", 1, 10],
    ["feedbackStart", 0, 5],
    ["praisePoints", 0, 5],
    ["concernPoints", 0, 5],
  ];
  for (const [key, min, max] of checks) {
    const n = num(input[key], min, max);
    if (n === null) return { error: "One of those numbers isn't sensible." };
    (s as Record<string, unknown>)[key] = n;
  }
  const days = [...new Set((input.workDays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { error: "Pick at least one working day." };
  s.workDays = days;
  s.types = {};
  for (const [kind, rule] of Object.entries(input.types ?? {})) {
    const hours = num(rule?.hours, 0.1, 24 * 30);
    const units = num(rule?.units, 0, 50);
    if (hours === null || units === null || !kind.trim()) return { error: "Each type needs a time (in hours) and what it counts for." };
    s.types[kind.trim()] = { hours, units };
  }
  if (!Object.keys(s.types).length) return { error: "Keep at least one type of work." };
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: SCORING_KEY }, create: { key: SCORING_KEY, value }, update: { value } });
  done();
  return {};
}

// ---------- categories ----------

type CategoryInput = { name: string; weight: number; keywords: string; repeats: boolean };
const cleanCategory = (input: CategoryInput) => {
  const name = input.name.trim();
  if (!name) return { error: "Give the category a name." };
  const weight = num(input.weight, 0, 5);
  if (weight === null) return { error: "A category counts between 0 and 5 mistakes." };
  const keywords = input.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(", ");
  return { data: { name, weight, keywords: keywords || null, repeats: !!input.repeats } };
};

// A kind of feedback, for sorting Frame.io comments into. Core only.
export async function addCategory(input: CategoryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the categories." };
  const c = cleanCategory(input);
  if ("error" in c) return c;
  if (await prisma.feedbackCategory.findUnique({ where: { name: c.data.name } })) return { error: "There's already a category with that name." };
  const last = await prisma.feedbackCategory.aggregate({ _max: { sortOrder: true } });
  await prisma.feedbackCategory.create({ data: { ...c.data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  done();
  return {};
}

// Renaming carries every feedback point in it along.
export async function updateCategory(id: string, input: CategoryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the categories." };
  const c = cleanCategory(input);
  if ("error" in c) return c;
  const before = await prisma.feedbackCategory.findUnique({ where: { id } });
  if (!before) return { error: "That category is gone." };
  if (before.name === "Others" && c.data.name !== "Others") return { error: "Others stays: it's where anything unsorted goes." };
  if (c.data.name !== before.name && (await prisma.feedbackCategory.findUnique({ where: { name: c.data.name } }))) return { error: "There's already a category with that name." };
  await prisma.$transaction([
    prisma.feedbackCategory.update({ where: { id }, data: c.data }),
    prisma.performanceEntry.updateMany({ where: { category: before.name, kind: "mistake" }, data: { category: c.data.name } }),
  ]);
  done();
  return {};
}

// Its feedback points move to Others.
export async function deleteCategory(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the categories." };
  const before = await prisma.feedbackCategory.findUnique({ where: { id } });
  if (!before) return {};
  if (before.name === "Others") return { error: "Others stays: it's where anything unsorted goes." };
  await prisma.$transaction([
    prisma.performanceEntry.updateMany({ where: { category: before.name, kind: "mistake" }, data: { category: "Others" } }),
    prisma.feedbackCategory.delete({ where: { id } }),
  ]);
  done();
  return {};
}

// ---------- feedback ----------

// A Frame.io comment re-sorted by hand: into a category, or out of the
// score as praise or not feedback at all.
export async function sortEntry(id: string, to: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can re-sort feedback." };
  if (to === "praise" || to === "note") {
    await prisma.performanceEntry.update({ where: { id }, data: { kind: to, category: null, reviewed: true } });
  } else {
    if (!(await prisma.feedbackCategory.findUnique({ where: { name: to } }))) return { error: "That category doesn't exist." };
    await prisma.performanceEntry.update({ where: { id }, data: { kind: "mistake", category: to, reviewed: true } });
  }
  done();
  return {};
}

// Sort with AI: only when core clicks it. Claude re-sorts the Frame.io
// comments given that nobody has sorted by hand.
export async function sortWithAi(ids: string[]): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can re-sort feedback." };
  try {
    await aiSortEntries(ids.slice(0, 200));
    done();
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Claude couldn't sort them just now." };
  }
}

export type EntryInput = {
  editorId: string;
  // mistake (a feedback point on the work), or core's own: positive | negative
  kind: string;
  // a mistake's category; for positive or negative, what it's about
  category: string;
  body: string;
  count: number;
  points: number;
  day: string; // yyyy-mm-dd
  taskId: string;
};

function clean(input: EntryInput) {
  if (!["mistake", "positive", "negative"].includes(input.kind)) return { error: "Pick what kind of feedback this is." };
  const body = input.body.trim();
  if (!body) return { error: "Write what it was about." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Pick the day it happened." };
  const mistake = input.kind === "mistake";
  const count = Math.round(Number(input.count));
  if (mistake && (!Number.isFinite(count) || count < 1 || count > 99)) return { error: "Times should be between 1 and 99." };
  const points = num(input.points, 0.1, 5);
  if (!mistake && points === null) return { error: "Points should be between 0.1 and 5." };
  return {
    data: {
      kind: input.kind,
      category: input.category.trim() || (mistake ? "Others" : null),
      body,
      count: mistake ? count : 1,
      points: mistake ? null : points,
      // midday in India, so the day never slips either way
      at: new Date(`${input.day}T12:00:00+05:30`),
      taskId: input.taskId || null,
    },
  };
}

// Written in by core: a mistake on the work, praise, or negative feedback.
export async function logEntry(input: EntryInput): Promise<Result> {
  const me = await requireOps();
  if (!me) return { error: "Only core members can add feedback." };
  const c = clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.create({ data: { ...c.data, editorId: input.editorId, source: "manual", by: me.name, loggedById: me.id, reviewed: true } });
  done();
  return {};
}

export async function updateEntry(id: string, input: EntryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change feedback." };
  const c = clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.update({ where: { id }, data: { ...c.data, reviewed: true } });
  done();
  return {};
}

export async function deleteEntry(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can remove feedback." };
  await prisma.performanceEntry.delete({ where: { id } });
  done();
  return {};
}

// The Sync button: new Frame.io review comments, sorted, with snapshots.
export async function syncFeedback(): Promise<Result & { added?: number; mistakes?: number; snapshots?: number }> {
  if (!(await requireOps())) return { error: "Only core members can sync feedback." };
  try {
    const res = await syncFrameioFeedback();
    done();
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Frame.io couldn't be reached." };
  }
}

// ---------- videos and leave ----------

// A video left out of (or put back into) the editor's numbers.
export async function setTaskExcluded(taskId: string, excluded: boolean): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change what counts." };
  // raw, so the task's updatedAt stays put: History and these numbers read
  // it as when the work was delivered, where the stage log doesn't say
  await prisma.$executeRaw`UPDATE "Task" SET "kpiExcluded" = ${excluded} WHERE id = ${taskId}`;
  done();
  return {};
}

// A video's type, put right: it sets the standard its speed is judged by and
// what it counts for in output.
export async function setTaskType(taskId: string, type: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change a video's type." };
  const tag = await prisma.taskTag.findUnique({ where: { name: type }, select: { id: true } });
  if (!tag) return { error: "That type doesn't exist." };
  const before = await prisma.task.findUnique({ where: { id: taskId }, select: { updatedAt: true } });
  if (!before) return { error: "That video is gone." };
  await prisma.task.update({ where: { id: taskId }, data: { tags: { set: [{ id: tag.id }] } } });
  // keep updatedAt where it was: History and these numbers read it as when
  // the work last moved
  await prisma.$executeRaw`UPDATE "Task" SET "updatedAt" = ${before.updatedAt} WHERE id = ${taskId}`;
  done();
  return {};
}

// A day an editor was away, so it doesn't count against their output.
export async function addLeave(editorId: string, day: string, note: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can record leave." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day." };
  await prisma.leaveDay.upsert({
    where: { editorId_day: { editorId, day } },
    create: { editorId, day, note: note.trim() || null },
    update: { note: note.trim() || null },
  });
  done();
  return {};
}

export async function removeLeave(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change leave." };
  await prisma.leaveDay.delete({ where: { id } });
  done();
  return {};
}
