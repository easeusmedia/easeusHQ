"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { ENTRY_KINDS, KPI_TARGETS, withTargetDefaults, type Targets } from "@/lib/editorKpi";
import { syncFrameioFeedback } from "@/lib/frameioFeedback";

type Result = { error?: string };

const LIMITS = { output: 500, mistakesPerVideo: 20, revisions: 20, onTimePct: 100, draftHours: 720 } as const;
const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

// The editing team's targets, how much each part counts, and how much each
// kind of work weighs. Admin sets them; ops reads them.
export async function saveKpiTargets(input: Targets): Promise<Result> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the targets." };

  const clean = withTargetDefaults({});
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const n = num(input[key], LIMITS[key]);
    if (n === null) return { error: "One of those targets isn't a sensible number." };
    clean[key] = n;
  }
  if (clean.mistakesPerVideo <= 0 || clean.revisions <= 0 || clean.output <= 0) return { error: "Targets need to be above zero." };
  for (const part of Object.keys(clean.weights) as (keyof Targets["weights"])[]) {
    const n = num(input.weights?.[part], 100);
    if (n === null) return { error: "Each weight is between 0 and 100." };
    clean.weights[part] = n;
  }
  if (Object.values(clean.weights).reduce((a, b) => a + b, 0) <= 0) return { error: "At least one part needs a weight." };
  clean.typeWeights = {};
  for (const [kind, w] of Object.entries(input.typeWeights ?? {})) {
    const n = num(w, 20);
    if (n === null || !kind.trim()) return { error: "Each kind of work weighs between 0 and 20." };
    clean.typeWeights[kind.trim()] = n;
  }
  const value = JSON.stringify(clean);
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
  revalidatePath("/performance", "layout");
  return {};
}

// Corrects any entry, automatic or not. Once someone has, it's reviewed.
export async function updateEntry(id: string, input: EntryInput): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can change feedback." };
  const c = clean(input);
  if ("error" in c) return c;
  await prisma.performanceEntry.update({ where: { id }, data: { ...c.data, reviewed: true } });
  revalidatePath("/performance", "layout");
  return {};
}

// One click on an automatic entry: it's a mistake after all, or it isn't
// (ordinary creative direction), or it's right as it is.
export async function reviewEntry(id: string, kind: "mistake" | "creative" | null): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can review feedback." };
  const entry = await prisma.performanceEntry.findUnique({ where: { id }, select: { category: true } });
  if (!entry) return { error: "That feedback is gone." };
  await prisma.performanceEntry.update({
    where: { id },
    data: kind ? { kind, category: kind === "mistake" ? (entry.category ?? "Others") : null, reviewed: true } : { reviewed: true },
  });
  revalidatePath("/performance", "layout");
  return {};
}

// "To review", all at once: every one stays as Claude sorted it.
export async function acceptAll(ids: string[]): Promise<Result> {
  if (!(await requireOps())) return { error: "Only the operations team can review feedback." };
  await prisma.performanceEntry.updateMany({ where: { id: { in: ids } }, data: { reviewed: true } });
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
