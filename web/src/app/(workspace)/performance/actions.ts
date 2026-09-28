"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { KPI_TARGETS, type Targets } from "@/lib/editorKpi";

const LIMITS: Record<keyof Targets, number> = { delivered: 500, onTimePct: 100, firstPassPct: 100, revisions: 20, draftHours: 720 };

// The editing team's targets. Admin sets them; ops reads them.
export async function saveKpiTargets(input: Targets): Promise<{ error?: string }> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the targets." };

  const clean = {} as Targets;
  for (const key of Object.keys(LIMITS) as (keyof Targets)[]) {
    const n = Number(input[key]);
    if (!Number.isFinite(n) || n < 0 || n > LIMITS[key]) return { error: "One of those targets isn't a sensible number." };
    clean[key] = n;
  }
  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({ where: { key: KPI_TARGETS }, create: { key: KPI_TARGETS, value }, update: { value } });
  revalidatePath("/performance");
  return {};
}
