"use server";

import { prisma } from "@/lib/prisma";
import { canTransition, type Role, type TaskStatus } from "@/lib/workflow";
import { revalidatePath } from "next/cache";

// NOTE: no auth wired yet (see PLAN.md) — actingUserId/actingRole are passed
// in from the form (or call site) for now. Once login exists, derive both
// from the session instead of trusting the caller for them.

export async function createTask(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title"));
  const assignedToId = String(formData.get("assignedToId") ?? "");
  const rawLink = String(formData.get("rawLink") ?? "") || null;
  const referenceLink = String(formData.get("referenceLink") ?? "") || null;
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!projectId || !title.trim() || !assignedToId) {
    throw new Error("Project, title, and an editor are all required");
  }

  await prisma.task.create({
    data: { projectId, title: title.trim(), dueDate: new Date(), assignedToId, rawLink, referenceLink, editingNotes },
    // status defaults to "queued"
  });
  revalidatePath("/tasks");
}

type StatusChangeExtras = { frameioLink?: string; driveLink?: string; reviewNotes?: string };

async function changeStatus(
  taskId: string,
  to: TaskStatus,
  actingUserId: string,
  actingRole: Role,
  extras: StatusChangeExtras
) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const isAssignee = task.assignedToId === actingUserId;

  if (!canTransition(task.status, to, { role: actingRole, isAssignee })) {
    throw new Error(`${actingRole} cannot move a task from ${task.status} to ${to}`);
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: to,
      ...(extras.frameioLink ? { frameioLink: extras.frameioLink } : {}),
      ...(extras.driveLink ? { driveLink: extras.driveLink } : {}),
      ...(to === "revision_requested"
        ? { reviewedById: actingUserId, reviewNotes: extras.reviewNotes ?? null }
        : {}),
    },
  });
  revalidatePath("/tasks");
}

// bound to the per-status buttons on a card (needs the extra link/notes fields)
export async function updateTaskStatus(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const to = String(formData.get("to")) as TaskStatus;
  const actingRole = String(formData.get("actingRole")) as Role;
  const actingUserId = String(formData.get("actingUserId"));

  await changeStatus(taskId, to, actingUserId, actingRole, {
    frameioLink: (formData.get("frameioLink") as string) || undefined,
    driveLink: (formData.get("driveLink") as string) || undefined,
    reviewNotes: (formData.get("reviewNotes") as string) || undefined,
  });
}

// called directly (not via a form) when a card is dragged to another column
export async function moveTask(
  taskId: string,
  to: TaskStatus,
  actingUserId: string,
  actingRole: Role,
  extras: StatusChangeExtras = {}
) {
  await changeStatus(taskId, to, actingUserId, actingRole, extras);
}

// editing details (title/editor/links) — admin & core only, matches their
// agreed "full rights to tweak everything" (see PLAN.md); editors only drive
// their own task's status, not its details
export async function updateTask(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const actingRole = String(formData.get("actingRole")) as Role;
  if (actingRole === "employee") throw new Error("Only admin/core can edit task details");

  const title = String(formData.get("title") ?? "").trim();
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  const rawLink = String(formData.get("rawLink") ?? "") || null;
  const referenceLink = String(formData.get("referenceLink") ?? "") || null;
  const assetLink = String(formData.get("assetLink") ?? "") || null;
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!title) throw new Error("Title is required");

  await prisma.task.update({
    where: { id: taskId },
    data: { title, assignedToId, rawLink, referenceLink, assetLink, editingNotes },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const actingRole = String(formData.get("actingRole")) as Role;
  if (actingRole === "employee") throw new Error("Only admin/core can delete a task");

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/tasks");
}
