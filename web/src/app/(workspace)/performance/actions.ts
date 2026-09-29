"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { ENTRY_KINDS, KPI_TARGETS, withTargetDefaults, type Targets } from "@/lib/editorKpi";
import { syncFrameioFeedback } from "@/lib/frameioFeedback";
import { syncIssues } from "@/lib/issues";

type Result = { error?: string };

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};

// The editing team's targets: output a day, each type's standard, the
// working week, what each part aims for and how much it counts, and where
// the grades fall. Admin sets them; core reads them.
export async function saveKpiTargets(input: Targets): Promise<Result> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the targets." };

  const t = withTargetDefaults({});
  const checks: [keyof Targets, number, number][] = [
    ["dailyUnits", 0.1, 50],
    ["dayStart", 0, 23],
    ["dayEnd", 1, 24],
    ["mistakesPerVideo", 0.01, 20],
    ["revisions", 0.01, 20],
    ["onStandardPct", 1, 100],
    ["clientMistakeWeight", 1, 10],
  ];
  for (const [key, min, max] of checks) {
    const n = num(input[key], min, max);
    if (n === null) return { error: "One of those targets isn't a sensible number." };
    (t as Record<string, unknown>)[key] = n;
  }
  if (t.dayEnd <= t.dayStart) return { error: "The working day has to end after it starts." };
  const days = [...new Set((input.workDays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { error: "Pick at least one working day." };
  t.workDays = days;
  for (const part of Object.keys(t.weights) as (keyof Targets["weights"])[]) {
    const n = num(input.weights?.[part], 0, 100);
    if (n === null) return { error: "Each weight is between 0 and 100." };
    t.weights[part] = n;
  }
  if (Object.values(t.weights).reduce((a, b) => a + b, 0) <= 0) return { error: "At least one part needs a weight." };
  for (const g of ["A", "B", "C"] as const) {
    const n = num(input.grades?.[g], 1, 100);
    if (n === null) return { error: "Grades sit between 1 and 100." };
    t.grades[g] = n;
  }
  if (!(t.grades.A > t.grades.B && t.grades.B > t.grades.C)) return { error: "A needs the highest score, then B, then C." };
  t.typeDays = {};
  for (const [kind, d] of Object.entries(input.typeDays ?? {})) {
    const n = num(d, 0.1, 30);
    if (n === null || !kind.trim()) return { error: "Each type's standard is between 0.1 and 30 working days." };
    t.typeDays[kind.trim()] = n;
  }
  const value = JSON.stringify(t);
  await prisma.appSetting.upsert({ where: { key: KPI_TARGETS }, create: { key: KPI_TARGETS, value }, update: { value } });
  revalidatePath("/performance", "layout");
  return {};
}

export type EntryInput = {
  editorId: string;
  kind: string;
  category: string;
  body: string;
  count: number;
  day: string; // yyyy-mm-dd
  taskId: string;
};

function clean(input: EntryInput) {
  if (!(input.kind in ENTRY_KINDS)) return { error: "Pick what kind of feedback this is." };
  const body = input.body.trim();
  if (!body) return { error: "Write what it was about." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Pick the day it happened." };
  const count = Math.round(Number(input.count));
  if (!Number.isFinite(count) || count < 1 || count > 99) return { error: "Times should be between 1 and 99." };
  const mistake = input.kind === "mistake";
  return {
    data: {
      kind: input.kind,
      category: mistake ? input.category.trim() || "Others" : null,
      body,
      count: mistake ? count : 1,
      // midday in India, so the day never slips either way
      at: new Date(`${input.day}T12:00:00+05:30`),
      taskId: input.taskId || null,
    },
  };
}

// Written in by ops: a mistake, creative feedback, praise or a note.
export async function logEntry(input: EntryInput): Promise<Result> {
  const me = await requireOps();
  if (!me) return { error: "Only the operations team can log feedback." };
  const c = clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.create({
    data: { ...c.data, editorId: input.editorId, source: "manual", by: me.name, loggedById: me.id, reviewed: true },
  });
  await syncIssues([input.editorId]);
  revalidatePath("/performance", "layout");
  return {};
}

// Corrects any entry, automatic or not. Once someone has, it's reviewed.
export async function updateEntry(id: string, input: EntryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can change feedback." };
  const c = clean(input);
  if ("error" in c) return c;
  const e = await prisma.performanceEntry.update({ where: { id }, data: { ...c.data, reviewed: true }, select: { editorId: true } });
  await syncIssues([e.editorId]);
  revalidatePath("/performance", "layout");
  return {};
}

// One click on an automatic entry: it's a mistake after all, or it isn't
// (ordinary creative direction), or it's right as it is.
export async function reviewEntry(id: string, kind: "mistake" | "creative" | null): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can review feedback." };
  const entry = await prisma.performanceEntry.findUnique({ where: { id }, select: { category: true, editorId: true } });
  if (!entry) return { error: "That feedback is gone." };
  await prisma.performanceEntry.update({
    where: { id },
    data: kind ? { kind, category: kind === "mistake" ? (entry.category ?? "Others") : null, reviewed: true } : { reviewed: true },
  });
  await syncIssues([entry.editorId]);
  revalidatePath("/performance", "layout");
  return {};
}

// "To review", all at once: every one stays as Claude sorted it.
export async function acceptAll(ids: string[]): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can review feedback." };
  await prisma.performanceEntry.updateMany({ where: { id: { in: ids } }, data: { reviewed: true } });
  await syncIssues();
  revalidatePath("/performance", "layout");
  return {};
}

export async function deleteEntry(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can remove feedback." };
  await prisma.performanceEntry.delete({ where: { id } });
  revalidatePath("/performance", "layout");
  return {};
}

// A task left out of (or put back into) the editor's numbers.
export async function setTaskExcluded(taskId: string, excluded: boolean): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can change what counts." };
  // raw, so the task's updatedAt stays put: History and these numbers read
  // it as when the work was delivered, where the stage log doesn't say
  await prisma.$executeRaw`UPDATE "Task" SET "kpiExcluded" = ${excluded} WHERE id = ${taskId}`;
  revalidatePath("/performance", "layout");
  return {};
}

// The Sync button: new Frame.io review comments, sorted, into the log.
export async function syncFeedback(): Promise<Result & { added?: number; mistakes?: number; sorted?: boolean }> {
  if (!(await requireOps())) return { error: "Only the operations team can sync feedback." };
  try {
    const res = await syncFrameioFeedback();
    revalidatePath("/performance", "layout");
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Frame.io couldn't be reached." };
  }
}

// Dealt with, or not yet. A Frame.io comment follows its tick in Frame.io
// on the next sync; this is for everything else, and for putting one right.
export async function setEntryResolved(id: string, resolved: boolean): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change this." };
  await prisma.performanceEntry.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  revalidatePath("/performance", "layout");
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
  revalidatePath("/performance", "layout");
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
  revalidatePath("/performance", "layout");
  return {};
}

export async function removeLeave(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change leave." };
  await prisma.leaveDay.delete({ where: { id } });
  revalidatePath("/performance", "layout");
  return {};
}

// An issue raised by hand: something an editor needs to work on, kept open
// until they have. Core only.
export async function addFocusArea(input: { editorId: string; title: string; category: string; note: string }): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can raise an issue." };
  const title = input.title.trim();
  if (!title) return { error: "Name the issue." };
  await prisma.focusArea.create({
    data: { editorId: input.editorId, title, category: input.category.trim() || null, note: input.note.trim() || null },
  });
  revalidatePath("/performance", "layout");
  return {};
}

// Resolved (it's stopped), or reopened. One that tracks a kind of mistake
// reopens by itself if that mistake comes back.
export async function setFocusImproved(id: string, improved: boolean): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can change an issue." };
  await prisma.focusArea.update({ where: { id }, data: { resolvedAt: improved ? new Date() : null } });
  revalidatePath("/performance", "layout");
  return {};
}

export async function deleteFocusArea(id: string): Promise<Result> {
  if (!(await requireOps())) return { error: "Only core members can remove an issue." };
  await prisma.focusArea.delete({ where: { id } });
  revalidatePath("/performance", "layout");
  return {};
}
