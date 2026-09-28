"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { aiSpend } from "@/lib/ai";
import type { Turn } from "@/lib/assistant";
import { answer, type AskResult } from "./answer";
import { apply, type Proposal } from "./proposals";

// The assistant is the admin's alone: every call re-checks the session.
async function admin() {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, email: true } }) : null;
  return me && canEditPeople(me) ? me : null;
}

export async function ask(history: Turn[], question: string): Promise<AskResult> {
  const me = await admin();
  if (!me) return { error: "Only the admin can use the assistant." };
  return answer(me, history, question);
}

// the panel's spend line, when it opens
export async function assistantUsage(): Promise<{ spent: number; budget: number; account: boolean } | null> {
  if (!(await admin())) return null;
  return aiSpend();
}

// The admin pressed Confirm on a proposed change.
export async function confirmProposal(p: Proposal): Promise<{ error?: string }> {
  const me = await admin();
  if (!me) return { error: "Only the admin can make changes here." };
  const failed = await apply(p, me.id);
  return failed ? { error: failed } : {};
}
