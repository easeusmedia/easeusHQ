"use server";

import { prisma } from "@/lib/prisma";
import { canTransition, type Role, type TaskStatus } from "@/lib/workflow";
import { revalidatePath } from "next/cache";
import { destroySession, getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { normalizeUrl } from "@/lib/links";
import { isAbhishekOrAdmin } from "@/lib/actingUser";

// Every link field below goes through this before it ever reaches the DB —
// rejects anything that isn't a real http(s) URL (a bare "javascript:..."
// or "data:..." string included) instead of silently saving it and letting
// it become a live <a href> for the next person who opens the card. Empty
// input is fine (clears the field); non-empty-but-invalid is not.
function requireLinkOrNull(value: string, label: string): string | null {
  if (!value.trim()) return null;
  const normalized = normalizeUrl(value);
  if (!normalized) throw new Error(`${label} doesn't look like a valid link.`);
  return normalized;
}

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

// Matches useActionState's (state, formData) => state contract, so a form
// that hits a validation error (a bad link, a missing field) shows that
// message inline instead of throwing all the way up to the nearest
// error.tsx — which is correct-but-jarring for something the user can
// just fix and resubmit.
export type TaskFormState = { error?: string; success?: boolean };

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title"));
  const assignedToId = String(formData.get("assignedToId") ?? "");
  let rawLink: string | null;
  let referenceLink: string | null;
  try {
    rawLink = requireLinkOrNull(String(formData.get("rawLink") ?? ""), "Raw footage link");
    referenceLink = requireLinkOrNull(String(formData.get("referenceLink") ?? ""), "Reference link");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!projectId || !title.trim() || !assignedToId) {
    return { error: "Project, title, and an editor are all required" };
  }

  const task = await prisma.task.create({
    // sortOrder: Date.now() puts new cards after every existing one (which
    // default to 0) without needing to query the column's current max
    data: {
      projectId,
      title: title.trim(),
      dueDate: new Date(),
      assignedToId,
      rawLink,
      referenceLink,
      editingNotes,
      sortOrder: Date.now(),
    },
    // status defaults to "queued"
  });

  const actorId = await getSessionUserId();
  if (actorId) {
    await prisma.activityLog.create({ data: { actorId, action: "created", entity: "Task", entityId: task.id } });
  }
  revalidatePath("/tasks");
  return { success: true };
}

type StatusChangeExtras = { frameioLink?: string; driveLink?: string; reviewNotes?: string; sortOrder?: number };

// Returns {error} instead of throwing — moveTask/reorderTask are called
// directly from client code (not a <form action>), and a thrown Server
// Action error gets its message redacted to a generic "Minified React
// error #441" digest in production (Next.js only preserves the message
// for an error a form action returns, not one it throws). Same reason
// createTask/updateTask were converted earlier.
async function changeStatus(
  taskId: string,
  to: TaskStatus,
  actingUserId: string,
  actingRole: Role,
  extras: StatusChangeExtras
): Promise<TaskFormState> {
  try {
    const frameioLink = extras.frameioLink ? requireLinkOrNull(extras.frameioLink, "Frame.io link") : null;
    const driveLink = extras.driveLink ? requireLinkOrNull(extras.driveLink, "Drive link") : null;

    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const isAssignee = task.assignedToId === actingUserId;

    if (!canTransition(task.status, to, { role: actingRole, isAssignee })) {
      return { error: `${actingRole} cannot move a task from ${task.status} to ${to}` };
    }

    // hard rule, not just a UI nicety: a task can't be marked delivered
    // without a Drive link on record — enforced here so it holds regardless
    // of which UI path (button, dropdown, or a future API caller) triggers it
    if (to === "delivered_and_uploaded" && !driveLink && !task.driveLink) {
      return { error: "Add a Drive link before marking this delivered." };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: to,
        ...(extras.sortOrder !== undefined ? { sortOrder: extras.sortOrder } : {}),
        ...(frameioLink ? { frameioLink } : {}),
        ...(driveLink ? { driveLink } : {}),
        ...(to === "revision_requested"
          ? { reviewedById: actingUserId, reviewNotes: extras.reviewNotes ?? null, revisionCount: { increment: 1 } }
          : {}),
      },
    });
    // the record the calendar view reads — "this task had activity today"
    await prisma.activityLog.create({
      data: { actorId: actingUserId, action: `${task.status} → ${to}`, entity: "Task", entityId: taskId },
    });
    revalidatePath("/tasks");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update status." };
  }
}

// called directly (not via a form) — both the StatusSelect dropdown and
// dragging a card call this exact same function, so they behave identically
export async function moveTask(
  taskId: string,
  to: TaskStatus,
  actingUserId: string,
  actingRole: Role,
  extras: StatusChangeExtras = {}
): Promise<TaskFormState> {
  return changeStatus(taskId, to, actingUserId, actingRole, extras);
}

// pure manual reordering within a column — no status change, no workflow
// permission check, since this is just "where does this card sit" and
// doesn't touch anything the workflow rules care about
export async function reorderTask(taskId: string, sortOrder: number): Promise<TaskFormState> {
  try {
    await prisma.task.update({ where: { id: taskId }, data: { sortOrder } });
    revalidatePath("/tasks");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reorder that task." };
  }
}

// editing details (title/editor/links) — admin & core only, matches their
// agreed "full rights to tweak everything" (see PLAN.md); editors only drive
// their own task's status, not its details
export async function updateTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const taskId = String(formData.get("taskId"));
  const actingRole = String(formData.get("actingRole")) as Role;
  if (actingRole === "employee") return { error: "Only admin/core can edit task details" };

  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "") || undefined;
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  // frameioLink/driveLink inputs only exist in the form at all once the
  // task's current status makes them relevant (see EditTaskDialog) — using
  // .has() rather than .get() so "field wasn't shown" (leave untouched)
  // stays distinct from "field was shown and cleared" (null it out).
  let rawLink: string | null;
  let frameioLink: string | null | undefined;
  let driveLink: string | null | undefined;
  try {
    rawLink = requireLinkOrNull(String(formData.get("rawLink") ?? ""), "Raw footage link");
    frameioLink = formData.has("frameioLink")
      ? requireLinkOrNull(String(formData.get("frameioLink") ?? ""), "Frame.io link")
      : undefined;
    driveLink = formData.has("driveLink")
      ? requireLinkOrNull(String(formData.get("driveLink") ?? ""), "Drive link")
      : undefined;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!title) return { error: "Title is required" };

  // referenceLink/assetLink are intentionally not touched here — no inputs
  // for them anymore (everything extra goes in editingNotes now), and
  // leaving them out of this update preserves whatever old value a task
  // might already have.
  await prisma.task.update({
    where: { id: taskId },
    data: {
      title,
      projectId,
      assignedToId,
      rawLink,
      editingNotes,
      ...(frameioLink !== undefined ? { frameioLink } : {}),
      ...(driveLink !== undefined ? { driveLink } : {}),
    },
  });
  revalidatePath("/tasks");
  return { success: true };
}

export async function deleteTask(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const actingRole = String(formData.get("actingRole")) as Role;
  if (actingRole === "employee") throw new Error("Only admin/core can delete a task");

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/tasks");
}

// Permanently wipes a task and everything referencing it — for cleaning
// dummy/test rows out of History, not something ops reaches for on real
// client work (that's what deleteTask above is for, and it's reversible in
// spirit since the task is still "real"; this one leaves nothing behind).
// Deliberately re-checks the real signed-in session instead of trusting a
// client-supplied role, unlike the older deleteTask above — a destructive,
// unrecoverable action needs the stronger check even though the rest of
// this file doesn't do that yet (see the note at the top of this file).
export async function deleteTaskPermanently(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    throw new Error("Only Abhishek or an admin can permanently delete a task.");
  }

  await prisma.$transaction([
    prisma.feedback.deleteMany({ where: { taskId } }),
    prisma.activityLog.deleteMany({ where: { entity: "Task", entityId: taskId } }),
    prisma.task.delete({ where: { id: taskId } }),
  ]);
  revalidatePath("/tasks/history");
}

// polled by ApprovalWatcher independent of whatever /tasks/* page is
// actually showing — an editor camped on History or Calendar should still
// get told the moment one of their tasks is delivered, not only when
// they happen to be looking at the Board
export async function getMyActiveTaskSnapshot(userId: string) {
  return prisma.task.findMany({
    where: { assignedToId: userId, status: { not: "delivered_and_uploaded" } },
    select: { id: true, title: true, status: true },
  });
}

// on-demand, not preloaded onto every task in a board fetch — most cards'
// trails never get opened, so fetching all of them up front would be pure
// waste. The "created" row (always first, since logs are oldest-first) is
// exactly "assigned on this date by this person" — no separate field needed.
export async function getTaskActivity(taskId: string) {
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: taskId },
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  });
  return logs.map((log) => ({ createdAt: log.createdAt, action: log.action, actorName: log.actor.name }));
}
