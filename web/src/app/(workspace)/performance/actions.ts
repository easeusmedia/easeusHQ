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

// How the score is worked out: the 10 points part by part, the grades,
// the working week, reels a day, each type's standard and what it counts
// for, what a revision and a repeat cost Quality, and where Feedback
// starts. Admin only.
export async function saveScoring(input: Scoring): Promise<Result> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the scoring." };

  const s = withScoringDefaults({});
  const checks: [keyof Scoring, number, number][] = [
    ["quantityPoints", 0, 10],
    ["qualityPoints", 0, 10],
    ["feedbackPoints", 0, 10],
    ["speedPoints", 0, 10],
    ["reelsPerDay", 0.1, 50],
    ["revisionPoints", 0, 10],
    ["repeatMultiplier", 1, 10],
    ["feedbackStart", 0, 10],
    ["praisePoints", 0, 10],
  ];
  for (const [key, min, max] of checks) {
    const n = num(input[key], min, max);
    if (n === null) return { error: "One of those numbers isn't sensible." };
    (s as Record<string, unknown>)[key] = n;
  }
  if (Math.abs(s.quantityPoints + s.qualityPoints + s.feedbackPoints - 10) > 0.01) return { error: "Quantity, Quality and Feedback should add up to 10." };
  if (s.speedPoints > s.quantityPoints) return { error: "Speed is part of Quantity, so it can't be more than Quantity." };
  if (s.feedbackStart > s.feedbackPoints) return { error: "Feedback can't start above its own points." };
  const grades = (["A+", "A", "B", "C"] as const).map((g) => num(input.grades?.[g], 0, 10));
  if (grades.some((g) => g === null) || grades.some((g, i) => i > 0 && g! >= grades[i - 1]!)) return { error: "Each grade needs a lower score than the one above it." };
  s.grades = { "A+": grades[0]!, A: grades[1]!, B: grades[2]!, C: grades[3]! };
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
  s.creativeWords = String(input.creativeWords ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .join(", ");
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: SCORING_KEY }, create: { key: SCORING_KEY, value }, update: { value } });
  done();
  return {};
}

// ---------- mistake types ----------

type CategoryInput = { name: string; description: string; weight: number; keywords: string; repeats: boolean };
const cleanCategory = (input: CategoryInput) => {
  const name = input.name.trim();
  if (!name) return { error: "Give it a name." };
  // the Quality points one takes off
  const weight = num(input.weight, 0, 10);
  if (weight === null) return { error: "Points off should be between 0 and 10." };
  const keywords = input.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(", ");
  return { data: { name, description: input.description.trim() || null, weight, keywords: keywords || null, repeats: !!input.repeats } };
};

// A type of mistake, for sorting Frame.io comments into. Core only.
export async function addCategory(input: CategoryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the types." };
  const c = cleanCategory(input);
  if ("error" in c) return c;
  if (await prisma.feedbackCategory.findUnique({ where: { name: c.data.name } })) return { error: "There's already a type with that name." };
  const last = await prisma.feedbackCategory.aggregate({ _max: { sortOrder: true } });
  await prisma.feedbackCategory.create({ data: { ...c.data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  done();
  return {};
}

// Renaming carries every mistake filed under it along.
export async function updateCategory(id: string, input: CategoryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the types." };
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
  done();
  return {};
}

// Its mistakes move to Others.
export async function deleteCategory(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change the types." };
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
  const points = scored && !usual ? num(input.points, 0.1, 10) : null;
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
    },
  };
}

// Written in by core: a mistake, a creative change, praise, a concern, or a tip.
export async function logEntry(input: EntryInput): Promise<Result> {
  const me = await requireOps();
  if (!me) return { error: "Only core members can add feedback." };
  const c = await clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.create({ data: { ...c.data, editorId: input.editorId, source: "manual", by: me.name, loggedById: me.id, reviewed: true } });
  done();
  return {};
}

// Anything can be put right, whether it came from Frame.io, Notion or a person.
export async function updateEntry(id: string, input: EntryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change feedback." };
  const before = await prisma.performanceEntry.findUnique({ where: { id }, select: { source: true } });
  if (!before) return { error: "That feedback is gone." };
  const c = await clean(input, before.source === "frameio");
  if ("error" in c) return c;
  await prisma.performanceEntry.update({ where: { id }, data: { ...c.data, reviewed: true } });
  done();
  return {};
}

// A mistake that was really a creative change for that video (or back):
// one click, and it stops (or starts) counting. Its type is kept, so it
// goes back where it was.
export async function setCreative(id: string, creative: boolean): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change feedback." };
  const e = await prisma.performanceEntry.findUnique({ where: { id }, select: { category: true } });
  if (!e) return { error: "That's gone." };
  await prisma.performanceEntry.update({ where: { id }, data: { kind: creative ? "creative" : "mistake", category: e.category ?? "Others", reviewed: true } });
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

// ---------- videos ----------

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
