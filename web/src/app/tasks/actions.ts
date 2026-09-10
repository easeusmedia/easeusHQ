"use server";

import { prisma } from "@/lib/prisma";
import { canTransition, type Role, type TaskStatus } from "@/lib/workflow";
import { revalidatePath } from "next/cache";
import { destroySession, getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

// NOTE: login now exists (src/app/login), and page.tsx/history/page.tsx
// resolve actingUserId/actingRole from the verified session before ever
// putting them in a form — but the actions below still just take whatever
// values a form hands them, same as before. Fully closing that gap (making
// every action re-derive the actor from the session itself) is follow-up
// work, not done here.

export async function logout() {
  await destroySession();
  redirect("/login");
}

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

  const task = await prisma.task.create({
    data: { projectId, title: title.trim(), dueDate: new Date(), assignedToId, rawLink, referenceLink, editingNotes },
    // status defaults to "queued"
  });

  const actorId = await getSessionUserId();
  if (actorId) {
    await prisma.activityLog.create({ data: { actorId, action: "created", entity: "Task", entityId: task.id } });
  }
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
  // the record the calendar view reads — "this task had activity today"
  await prisma.activityLog.create({
    data: { actorId: actingUserId, action: `${task.status} → ${to}`, entity: "Task", entityId: taskId },
  });
  revalidatePath("/tasks");
}

// called directly (not via a form) — both the StatusSelect dropdown and
// dragging a card call this exact same function, so they behave identically
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
  const projectId = String(formData.get("projectId") ?? "") || undefined;
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  const rawLink = String(formData.get("rawLink") ?? "") || null;
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!title) throw new Error("Title is required");

  // referenceLink/assetLink are intentionally not touched here — no inputs
  // for them anymore (everything extra goes in editingNotes now), and
  // leaving them out of this update preserves whatever old value a task
  // might already have.
  await prisma.task.update({
    where: { id: taskId },
    data: { title, projectId, assignedToId, rawLink, editingNotes },
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
