"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import type { Turn } from "@/lib/assistant";
import { answer, type AskResult } from "./answer";
import { apply, type Proposal } from "./proposals";
import { withUndo, type Ref } from "@/lib/undo";

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

// The admin pressed Confirm on a proposed change.
export async function confirmProposal(p: Proposal): Promise<{ error?: string }> {
  const me = await admin();
  if (!me) return { error: "Only the admin can make changes here." };
  // one confirmed change, one step to undo (an addition is kept by the action that makes it)
  const ref = changed(p);
  const failed = ref
    ? await withUndo([ref], () => apply(p, me.id), { depth: "kind" in ref || ref.table === "Lead" ? 1 : 0, label: "table" in ref && ref.table === "Invoice" ? "Edited an invoice" : undefined })
    : await apply(p, me.id);
  return failed ? { error: failed } : {};
}

// the row a confirmed edit changes (edits.ts EDITABLE, by kind)
const TABLE: Record<string, string> = {
  client: "Client",
  project: "Project",
  department: "Team",
  role: "JobTitle",
  board: "Space",
  portal: "Space",
  stage: "BoardStage",
  tag: "FieldOption",
  lead: "Lead",
  contract: "Contract",
  file: "ProjectAsset",
  property: "BoardField",
  message: "StageMessage",
  deliverable: "Deliverable",
  client_tag: "Tag",
  document: "ClientDocument",
  step: "OnboardingStep",
  mistake_type: "FeedbackCategory",
  kind: "TaskTag",
  person: "User",
};
function changed(p: Proposal): Ref | null {
  if (p.target === "task" || p.target === "work") return { kind: p.target, id: p.targetId };
  if (p.action === "employee") return { table: "User", id: p.targetId };
  if (p.action === "invoice_status") return { table: "Invoice", id: p.targetId };
  if (p.action !== "edit") return null;
  if (p.values.kind === "task") return { kind: p.values.table === "work" ? "work" : "task", id: p.targetId };
  const table = TABLE[String(p.values.kind)];
  return table ? { table, id: p.targetId } : null;
}
