"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { assigneeWhere, canAssign, type Viewer } from "@/lib/scope";
import { pushWorkTaskToNotion, pushesToNotion } from "@/lib/notionPush";
import { normalizeUrl } from "@/lib/links";
import { revalidatePath } from "next/cache";
import { deleteWithRecord, departmentFromWords, recordDateChange } from "@/lib/taskTrack";
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
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId }, include: { departments: { select: { id: true, slug: true } } } }) : null;
  if (!user) throw new Error("Your session has ended. Please sign in again.");
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
// `current` is who has the task now: keeping them is always allowed, even
// once they've left, so editing an old task doesn't quietly reassign it.
async function resolveAssignee(me: Viewer, requested: string | undefined, current?: string | null): Promise<string> {
  if (!requested || requested === me.id) return me.id;
  if (requested === current) return requested;
  const target = await prisma.user.findUnique({ where: { id: requested }, select: { id: true, role: true, teamId: true, employment: true, departments: { select: { id: true } } } });
  // down the levels only (lib/scope canAssign); fail closed, onto yourself
  if (!target || target.employment === "former" || !canAssign(me, { ...target, departmentIds: target.departments.map((d) => d.id) })) return me.id;
  return target.id;
}

// The department a work task belongs to (whose Leads see it): its kind of
// work's, else the assignee's own
async function departmentOf(tagIds: string[], assignedToId: string, title = ""): Promise<string | null> {
  const tag = tagIds.length ? await prisma.taskTag.findFirst({ where: { id: { in: tagIds }, teamId: { not: null } }, select: { teamId: true } }) : null;
  if (tag) return tag.teamId;
  // no kind of work: the words in its title say where it belongs (a draw,
  // the person's own); nothing in it, the person's main department
  const person = await prisma.user.findUnique({ where: { id: assignedToId }, select: { teamId: true, departments: { select: { id: true } } } });
  const fromWords = title ? await departmentFromWords(title, [person?.teamId, ...(person?.departments ?? []).map((d) => d.id)].filter((x): x is string => !!x)) : null;
  return fromWords ?? person?.teamId ?? null;
}

// Which project a task hangs off, from what the person actually chose.
// Picking a client without naming a project is the common case — "something
// for Dr Tego" — and every client has a catch-all project for exactly that,
// the same one the editing board falls back to.
async function projectFor(input: { clientId?: string; projectId?: string }): Promise<string | null> {
  if (input.projectId) return input.projectId;
  if (!input.clientId) return null;
  const fallback =
    (await prisma.project.findFirst({ where: { clientId: input.clientId, id: { startsWith: "project-client-" } }, select: { id: true } })) ??
    (await prisma.project.findFirst({ where: { clientId: input.clientId }, orderBy: { createdAt: "desc" }, select: { id: true } }));
  return fallback?.id ?? null;
}

export async function createWorkTask(input: {
  assignedToId?: string;
  // a role picked with no kind of work of its own: its department
  roleId?: string;
  title: string;
  notes: string;
  tagIds?: string[];
  dueDate: string;
  clientId?: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
}): Promise<WorkTaskFormState> {
  const me = await requireRealUser();
  if (!input.title.trim()) return { error: "Please give it a title." };
  // Production's kinds of work are always for a client; a plain to-do (any
  // department) needn't be
  if (!input.projectId && !input.clientId && (input.tagIds?.length || input.roleId)) {
    const production = await prisma.team.findUnique({ where: { slug: "production" }, select: { id: true } });
    const [tags, role] = await Promise.all([
      prisma.taskTag.count({ where: { id: { in: input.tagIds ?? [] }, teamId: production?.id } }),
      input.roleId ? prisma.jobTitle.count({ where: { id: input.roleId, teamId: production?.id } }) : 0,
    ]);
    if (tags || role) return { error: "Production work is always for a client. Pick the client." };
  }

  const assignedToId = await resolveAssignee(me, input.assignedToId);

  const created = await prisma.workTask.create({
    data: {
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      projectId: await projectFor(input),
      links: cleanLinks(input.links),
      attachments: input.attachments,
      tags: { connect: (input.tagIds ?? []).map((id) => ({ id })) },
      teamId: input.roleId && !input.tagIds?.length ? ((await prisma.jobTitle.findUnique({ where: { id: input.roleId }, select: { teamId: true } }))?.teamId ?? null) : await departmentOf(input.tagIds ?? [], assignedToId, input.title),
      createdById: me.id,
      assignedToId,
      sortOrder: Date.now(),
    },
  });

  // Mirror it into Notion for the people whose work belongs there — same
  // rule the client queue uses. Best-effort on purpose: if Notion is down
  // the task is still created here and the sync button picks it up later.
  await mirrorIfOperations(assignedToId, created.id);

  revalidatePath("/my-tasks");
  return { success: true };
}

// Shared by create and the sync button: only Operations (and not the admin)
// mirrors into the Editing Queue.
async function mirrorIfOperations(userId: string, workTaskId: string) {
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, notionWorkbookDbId: true, team: { select: { slug: true } } },
  });
  // a personal workbook is itself the reason to mirror, regardless of team
  const mirrors =
    !!person?.notionWorkbookDbId ||
    (!!person && pushesToNotion({ role: person.role, teamSlug: person.team?.slug ?? null }));
  if (!mirrors) return;
  await pushWorkTaskToNotion(workTaskId).catch(() => {});
}

// Sends every mirrorable work task in view up to Notion — creating the rows
// that don't exist yet and refreshing the status and links on the ones that
// do. These tasks are born here, so this is one-directional by nature:
// there's nothing in Notion to pull back down over the top of them.
export async function syncWorkTasksToNotion(): Promise<{ pushed: number; skipped: number; error?: string }> {
  const me = await requireRealUser().catch(() => null);
  if (!me || me.role === "employee") return { pushed: 0, skipped: 0, error: "Only the operations team can sync." };

  // the work they may see (lib/scope)
  const viewer = me;
  // anyone whose work has a home in Notion: a core member with their own
  // workbook, or an Operations editor whose work belongs in the shared queue
  const tasks = await prisma.workTask.findMany({
    where: {
      AND: [
        assigneeWhere(viewer),
        {
          OR: [
            // already in someone's Notion: kept current, or moved to the new
            // assignee's, or taken out if they have no place there
            { notionPageId: { not: null } },
            {
              assignedTo: {
                OR: [
                  { notionWorkbookDbId: { not: null } },
                  { team: { slug: { in: ["production", "client-services"] } } },
                ],
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  let pushed = 0;
  let skipped = 0;
  for (const t of tasks) {
    const res = await pushWorkTaskToNotion(t.id);
    if (res.error) skipped++;
    else pushed++;
  }
  revalidatePath("/my-tasks");
  return { pushed, skipped };
}

// A task is yours to touch if it's assigned to you, you created it, or
// you're an admin — the same three-way check on every write below.
async function assertCanTouch(taskId: string) {
  const me = await requireRealUser();
  const task = await prisma.workTask.findUnique({ where: { id: taskId }, include: { assignedTo: { select: { id: true, teamId: true } } } });
  if (!task) throw new Error("This task no longer exists.");
  // yours, one you handed out, or — for a Lead — anything they can see on
  // the Board (a Founder: anything)
  const mine = task.assignedToId === me.id || task.createdById === me.id;
  const teamLead = me.role !== "employee" && (await prisma.workTask.count({ where: { AND: [{ id: taskId }, assigneeWhere(me)] } })) > 0;
  if (!mine && !teamLead && !isAbhishekOrAdmin(me)) {
    throw new Error("Only the person assigned to this task can change it.");
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
  clientId?: string;
  projectId: string;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
  // why the completion date moved, when it did
  dateReason?: string;
  // a department picked by hand
  teamId?: string;
}): Promise<WorkTaskFormState> {
  let me;
  let existing;
  try {
    me = await requireRealUser();
    existing = await assertCanTouch(input.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that task." };
  }
  if (!input.title.trim()) return { error: "Please give it a title." };
  // a completion date that moves needs a reason, and the move is kept
  const nextDue = input.dueDate ? new Date(input.dueDate) : null;
  const moved = !!existing.dueDate && (nextDue?.getTime() ?? null) !== existing.dueDate.getTime();
  if (moved && !input.dateReason?.trim()) return { error: "Say why the due date is moving." };

  await prisma.workTask.update({
    where: { id: input.id },
    data: {
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      dueDate: nextDue,
      ...(input.teamId ? { teamId: input.teamId } : {}),
      projectId: await projectFor(input),
      links: cleanLinks(input.links),
      attachments: input.attachments,
      ...(input.assignedToId ? { assignedToId: await resolveAssignee(me, input.assignedToId, existing.assignedToId) } : {}),
      ...(input.tagIds ? { tags: { set: input.tagIds.map((id) => ({ id })) } } : {}),
    },
  });
  if (moved) await recordDateChange({ kind: "work", id: input.id }, existing.dueDate, nextDue, input.dateReason!, me.id, existing.strikes);

  revalidatePath("/my-tasks");
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
  // a request just finished: whoever asked hears of it (requests.ts)
  if (status === "done" && !existing?.completedAt && moved.category === "Request" && moved.createdById !== moved.assignedToId) {
    await prisma.notice.create({ data: { workTaskId: moved.id, forId: moved.createdById, kind: "shared", body: `Done: ${moved.title}` } }).catch(() => {});
  }
  revalidatePath("/my-tasks");
  revalidatePath("/team");
  return { success: true };
}

export async function reorderWorkTask(taskId: string, sortOrder: number): Promise<WorkTaskFormState> {
  try {
    await assertCanTouch(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reorder that task." };
  }
  await prisma.workTask.update({ where: { id: taskId }, data: { sortOrder } });
  revalidatePath("/my-tasks");
  return { success: true };
}

// Deleting needs a reason; the task is kept whole in the record (History
// shows it, Level 1 can bring it back: lib/taskTrack.ts)
export async function deleteWorkTask(taskId: string, reason: string): Promise<WorkTaskFormState> {
  let me;
  try {
    me = await requireRealUser();
    await assertCanTouch(taskId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete that task." };
  }
  const res = await deleteWithRecord({ kind: "work", id: taskId }, reason, me);
  if (res.error) return res;
  revalidatePath("/my-tasks");
  revalidatePath("/history");
  return { success: true };
}
