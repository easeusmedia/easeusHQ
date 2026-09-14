"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
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

// assignedToId is *never* taken from the caller directly — it's always
// `actingUserId`, which the page resolves the same way every other page in
// this app resolves "who am I acting as" (see lib/actingUser.ts): your own
// session id for anyone but an admin, or — only for an admin — whoever
// they're currently "Viewing as" in the sidebar. That existing mechanism is
// the entire delegation path: an admin creates a task for someone else by
// first viewing as them, not through a separate assignee picker here.
export async function createWorkTask(input: {
  actingUserId: string;
  title: string;
  notes: string;
  category: string;
  dueDate: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
}): Promise<WorkTaskFormState> {
  const me = await requireRealUser();
  if (!input.title.trim()) return { error: "Give it a title." };

  // an admin acting as themselves, or as someone else via Viewing as, is
  // always fine; anyone else can only ever land on their own id — even if
  // the client somehow sent a different one
  const assignedToId = isAbhishekOrAdmin(me) ? input.actingUserId : me.id;

  await prisma.workTask.create({
    data: {
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      category: input.category.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      projectId: input.projectId || null,
      links: cleanLinks(input.links),
      attachments: input.attachments,
      createdById: me.id,
      assignedToId,
      sortOrder: Date.now(),
    },
  });

  revalidatePath("/tasks/my");
  return { success: true };
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
  title: string;
  notes: string;
  category: string;
  dueDate: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
}): Promise<WorkTaskFormState> {
  try {
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
      category: input.category.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      projectId: input.projectId || null,
      links: cleanLinks(input.links),
      attachments: input.attachments,
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
  await prisma.workTask.update({ where: { id: taskId }, data: { status, sortOrder } });
  revalidatePath("/tasks/my");
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
