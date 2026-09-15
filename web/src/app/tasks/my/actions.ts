"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { assigneeWhere, canSeeMember, type Viewer } from "@/lib/scope";
import { pushWorkTaskToNotion, pushesToNotion } from "@/lib/notionPush";
import { normalizeUrl } from "@/lib/links";
import { revalidatePath } from "next/cache";
import type { WorkTaskStatus } from "@prisma/client";

export type WorkTaskLink = { label: string; url: string };
export type WorkTaskAttachment = { name: string; dataUrl: string };
export type WorkTaskFormState = { error?: string; success?: boolean };

// Every actions below re-derives who's *really* signed in from the session
// — never trusts a client-supplied id for that — since the one rule this
// whole feature turns on ("you can only create a task for yourself unless
// you're an admin") is meaningless if the id it checks can just be handed
// in by whoever's calling.
async function requireRealUser() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user) throw new Error("Not signed in.");
  return user;
}

function cleanLinks(links: WorkTaskLink[]): WorkTaskLink[] {
  return links
    .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) ?? "" }))
    .filter((l) => l.url); // silently drop a row someone left blank/unparseable rather than blocking the whole save on it
}

// Who this person is allowed to hand work to. Replaces the old "Viewing
// as" delegation path: a core member running Operations should be able to
// assign to their own team from the task form, without first pretending to
// be that person. Still re-derived from the session — an assignee posted
// from the client is checked, never trusted.
async function resolveAssignee(me: Viewer, requested: string | undefined): Promise<string> {
  if (!requested || requested === me.id) return me.id;
  const target = await prisma.user.findUnique({ where: { id: requested }, select: { id: true, teamId: true } });
  if (!target || !canSeeMember(me, target)) return me.id; // fail closed, onto yourself
  return target.id;
}

export async function createWorkTask(input: {
  assignedToId?: string;
  title: string;
  notes: string;
  tagIds?: string[];
  dueDate: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
}): Promise<WorkTaskFormState> {
  const me = await requireRealUser();
  if (!input.title.trim()) return { error: "Give it a title." };

  const assignedToId = await resolveAssignee(me, input.assignedToId);

  const created = await prisma.workTask.create({
    data: {
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      projectId: input.projectId || null,
      links: cleanLinks(input.links),
      attachments: input.attachments,
      tags: { connect: (input.tagIds ?? []).map((id) => ({ id })) },
      createdById: me.id,
      assignedToId,
      sortOrder: Date.now(),
    },
  });

  // Mirror it into Notion for the people whose work belongs there — same
  // rule the client queue uses. Best-effort on purpose: if Notion is down
  // the task is still created here and the sync button picks it up later.
  await mirrorIfOperations(assignedToId, created.id);

  revalidatePath("/tasks/my");
  return { success: true };
}

// Shared by create and the sync button: only Operations (and not the admin)
// mirrors into the Editing Queue.
async function mirrorIfOperations(userId: string, workTaskId: string) {
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, team: { select: { slug: true } } },
  });
  if (!person || !pushesToNotion({ role: person.role, teamSlug: person.team?.slug ?? null })) return;
  await pushWorkTaskToNotion(workTaskId).catch(() => {});
}

// Sends every mirrorable work task in view up to Notion — creating the rows
// that don't exist yet and refreshing the status and links on the ones that
// do. These tasks are born here, so this is one-directional by nature:
// there's nothing in Notion to pull back down over the top of them.
export async function syncWorkTasksToNotion(): Promise<{ pushed: number; skipped: number; error?: string }> {
  const me = await requireRealUser().catch(() => null);
  if (!me || me.role === "employee") return { pushed: 0, skipped: 0, error: "Only ops team members can sync." };

  // their own team's work, or everyone's for whoever sees every team
  const viewer = { id: me.id, role: me.role, email: me.email, teamId: me.teamId };
  const tasks = await prisma.workTask.findMany({
    where: {
      ...assigneeWhere(viewer),
      assignedTo: { role: { not: "admin" }, team: { slug: "operations" } },
    },
    select: { id: true },
    take: 100,
  });

  let pushed = 0;
  let skipped = 0;
  for (const t of tasks) {
    const res = await pushWorkTaskToNotion(t.id);
    if (res.error) skipped++;
    else pushed++;
  }
  revalidatePath("/tasks/my");
  return { pushed, skipped };
}

// A task is yours to touch if it's assigned to you, you created it, or
// you're an admin — the same three-way check on every write below.
async function assertCanTouch(taskId: string) {
  const me = await requireRealUser();
  const task = await prisma.workTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("That task doesn't exist any more.");
  if (task.assignedToId !== me.id && task.createdById !== me.id && !isAbhishekOrAdmin(me)) {
    throw new Error("Not your task to change.");
  }
  return task;
}

export async function updateWorkTask(input: {
  id: string;
  assignedToId?: string;
  title: string;
  notes: string;
  tagIds?: string[];
  dueDate: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
}): Promise<WorkTaskFormState> {
  let me;
  try {
    me = await requireRealUser();
    await assertCanTouch(input.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that task." };
  }
  if (!input.title.trim()) return { error: "Give it a title." };

  await prisma.workTask.update({
    where: { id: input.id },
    data: {
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      projectId: input.projectId || null,
      links: cleanLinks(input.links),
      attachments: input.attachments,
      ...(input.assignedToId ? { assignedToId: await resolveAssignee(me, input.assignedToId) } : {}),
      ...(input.tagIds ? { tags: { set: input.tagIds.map((id) => ({ id })) } } : {}),
    },
  });

  revalidatePath("/tasks/my");
  return { success: true };
}

// drag-and-drop: status change, and/or a new sortOrder within a column —
// no workflow graph to check against like the client Task board has, any
// of the four columns is a valid drop target from any other
export async function moveWorkTask(taskId: string, status: WorkTaskStatus, sortOrder: number): Promise<WorkTaskFormState> {
  try {
    await assertCanTouch(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't move that task." };
  }
  // completedAt is what work history is built from, so it records when the
  // work was actually finished. Set on the first arrival at `done` and left
  // alone on later moves within it; cleared if the task comes back out, so
  // a reopened task doesn't sit in history claiming to be finished.
  const existing = await prisma.workTask.findUnique({ where: { id: taskId }, select: { completedAt: true } });
  const completedAt = status === "done" ? existing?.completedAt ?? new Date() : null;

  const moved = await prisma.workTask.update({ where: { id: taskId }, data: { status, sortOrder, completedAt } });
  // a stage change is the thing most worth mirroring, so it goes up now
  // rather than waiting for someone to press sync
  await mirrorIfOperations(moved.assignedToId, moved.id);
  revalidatePath("/tasks/my");
  revalidatePath("/tasks/people");
  return { success: true };
}

export async function reorderWorkTask(taskId: string, sortOrder: number): Promise<WorkTaskFormState> {
  try {
    await assertCanTouch(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reorder that task." };
  }
  await prisma.workTask.update({ where: { id: taskId }, data: { sortOrder } });
  revalidatePath("/tasks/my");
  return { success: true };
}

export async function deleteWorkTask(taskId: string): Promise<WorkTaskFormState> {
  try {
    await assertCanTouch(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete that task." };
  }
  await prisma.workTask.delete({ where: { id: taskId } });
  revalidatePath("/tasks/my");
  return { success: true };
}
