"use server";

import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, ALL_STATUSES, WORKFLOW_STAGES, canTransition, workflowOf, type Role, type TaskStatus, type Workflow } from "@/lib/workflow";
import { revalidatePath } from "next/cache";
import { destroySession, getSessionUserId, requireOps } from "@/lib/auth";
import { assigneeWhere, canAssign, canEditTag } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { createInNotion, pushesToNotion, updateInNotion } from "@/lib/notionPush";
import { matchClient } from "@/lib/notionMapping";
import { STAGE, movedByHand, stageChangeAction } from "@/lib/stages";
import { frameioConnected, shareFiles, shareIdFrom } from "@/lib/frameio";
import { handedOffStamp } from "@/lib/due";
import { isLetter, needsGrade } from "@/lib/videoScore";
import { refreshVideoScores } from "@/lib/videoScores";
import { exportFolder, uploadFromUrl } from "@/lib/drive";
import { redirect } from "next/navigation";
import { normalizeUrl } from "@/lib/links";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { fetchTaskRows, getTitleText, getStatusName, getFirstPersonName, getUrl, getDate } from "@/lib/notion";

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

// Who's doing this, from the signed-in session — never from the form or the
// call: what a request may do is decided here, by who actually sent it. An
// editor claiming to be admin in a form used to be taken at their word.
async function sessionActor() {
  const id = await getSessionUserId();
  return id ? prisma.user.findUnique({ where: { id }, select: { id: true, role: true } }) : null;
}

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

// A Member in Production (an editor, a designer): their work is measured by
// type (a reel, a trailer, a thumbnail), on the Performance page.
const editsVideos = (u: { role: string; team: { slug: string } | null }) => u.role === "employee" && u.team?.slug === "production";
const TYPE_NEEDED = "Pick the type of work (Reel, Trailer, Podcast editing…) before giving this to an editor.";

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const actor = await sessionActor();
  if (!actor) return { error: "Your session has ended. Please sign in again." };
  const title = String(formData.get("title"));
  const clientId = String(formData.get("clientId") ?? "");
  const assignedToId = String(formData.get("assignedToId") ?? "");
  // A task can start as just a client and a title — everything else gets
  // filled in later, from the task itself. With no project picked it goes on
  // that client's own catch-all project, where their loose work already lives.
  let projectId = String(formData.get("projectId") ?? "");
  if (!projectId && clientId) {
    const fallback =
      (await prisma.project.findFirst({ where: { clientId, id: { startsWith: "project-client-" } }, select: { id: true } })) ??
      (await prisma.project.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true } }));
    projectId = fallback?.id ?? "";
  }
  let rawLink: string | null;
  let referenceLink: string | null;
  try {
    rawLink = requireLinkOrNull(String(formData.get("rawLink") ?? ""), "Raw footage link");
    referenceLink = requireLinkOrNull(String(formData.get("referenceLink") ?? ""), "Reference link");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }
  const editingNotes = String(formData.get("editingNotes") ?? "").trim() || null;
  if (!title.trim()) return { error: "Give the task a title." };
  if (!projectId) {
    return { error: clientId ? "That client has no project yet. Add one with + New." : "Pick the client this task is for." };
  }
  // work goes down the levels: a Member adds their own, a Lead also for
  // the Members in their departments (lib/scope canAssign)
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has ended. Please sign in again." };
  if (assignedToId && assignedToId !== viewer.id) {
    const target = await prisma.user.findUnique({ where: { id: assignedToId }, select: { id: true, role: true, teamId: true, departments: { select: { id: true } } } });
    if (!target || !canAssign(viewer, { ...target, departmentIds: target.departments.map((d) => d.id) })) {
      return { error: viewer.role === "employee" ? "You can only add tasks for yourself." : "You can only give work to the Members in your departments." };
    }
  }
  const dueDateInput = String(formData.get("dueDate") ?? "").trim();
  const deliveryDateInput = String(formData.get("deliveryDate") ?? "").trim();
  const postDateInput = String(formData.get("postDate") ?? "").trim();
  const internal = formData.get("internal") === "on";
  const scheduledForInput = String(formData.get("scheduledFor") ?? "").trim();

  // unassigned is fine — someone picks it up later
  const assignee = assignedToId
    ? await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { role: true, employment: true, team: { select: { slug: true } } },
      })
    : null;
  if (assignedToId && (!assignee || assignee.employment === "former")) {
    return { error: "That person is no longer on the team. Please choose someone else." };
  }
  // an editor's work is measured by its type, so it needs one
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  if (assignee && editsVideos(assignee) && !tagIds.length) {
    return { error: TYPE_NEEDED };
  }
  // its kind of work decides how it moves and whose department it's in
  const { workflow, teamId } = await placeTask(tagIds, assignedToId || null, String(formData.get("workflow") ?? ""));

  const task = await prisma.task.create({
    // sortOrder: Date.now() puts new cards after every existing one (which
    // default to 0) without needing to query the column's current max
    data: {
      projectId,
      title: title.trim(),
      // when the assignee has to finish it by, not when it was created
      dueDate: dueDateInput ? new Date(dueDateInput) : null,
      // internal work never goes to the client, so it has no delivery day
      deliveryDate: deliveryDateInput && !internal ? new Date(deliveryDateInput) : null,
      // nor a day it goes live
      postDate: postDateInput && !internal ? new Date(postDateInput) : null,
      // hidden from the assigned editor until this date — see the schema comment
      scheduledFor: scheduledForInput ? new Date(scheduledForInput) : null,
      assignedToId: assignedToId || null,
      rawLink,
      referenceLink,
      editingNotes,
      sortOrder: Date.now(),
      internal,
      workflow,
      teamId,
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
    // status defaults to "queued"
  });

  await prisma.activityLog.create({ data: { actorId: actor.id, action: "created", entity: "Task", entityId: task.id } });

  // Mirror it into Notion's Editing Queue, for the people whose work lives
  // there. Deliberately not awaited for correctness: if Notion is slow or
  // down, the task is still created here and the next sync picks it up as
  // unmirrored — creating a task must never depend on someone else's API.
  if (workflow === "video" && assignee && pushesToNotion({ role: assignee.role, teamSlug: assignee.team?.slug ?? null })) {
    await createInNotion(task.id).catch(() => {});
  }

  revalidatePath("/board");
  return { success: true };
}

// A task's workflow and department, from its kind of work: the first kind
// that has them, else the assignee's department (or Production, where the
// editing queue lives). Exported for My tasks, which adds client work too.
export async function placeTask(tagIds: string[], assignedToId: string | null, fallback?: string): Promise<{ workflow: Workflow; teamId: string | null }> {
  const [tags, assignee, production] = await Promise.all([
    tagIds.length ? prisma.taskTag.findMany({ where: { id: { in: tagIds } }, select: { workflow: true, teamId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }) : [],
    assignedToId ? prisma.user.findUnique({ where: { id: assignedToId }, select: { teamId: true } }) : null,
    prisma.team.findUnique({ where: { slug: "production" }, select: { id: true } }),
  ]);
  const kind = tags[0];
  return { workflow: workflowOf(kind?.workflow ?? fallback), teamId: kind?.teamId ?? assignee?.teamId ?? production?.id ?? null };
}

type StatusChangeExtras = { frameioLink?: string; driveLink?: string; reviewNotes?: string; sortOrder?: number; grade?: string };

// Returns {error} instead of throwing — moveTask/reorderTask are called
// directly from client code (not a <form action>), and a thrown Server
// Action error gets its message redacted to a generic "Minified React
// error #441" digest in production (Next.js only preserves the message
// for an error a form action returns, not one it throws). Same reason
// createTask/updateTask were converted earlier.
async function changeStatus(taskId: string, to: TaskStatus, extras: StatusChangeExtras): Promise<TaskFormState> {
  try {
    const actor = await sessionActor();
    if (!actor) return { error: "Your session has ended. Please sign in again." };
    const actingUserId = actor.id;
    const actingRole = actor.role as Role;
    const frameioLink = extras.frameioLink ? requireLinkOrNull(extras.frameioLink, "Frame.io link") : null;
    const driveLink = extras.driveLink ? requireLinkOrNull(extras.driveLink, "Drive link") : null;

    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const isAssignee = task.assignedToId === actingUserId;

    if (!canTransition(task.status, to, { role: actingRole, isAssignee }, task.workflow)) {
      return { error: "You can't move this task to that stage." };
    }

    // hard rule, not just a UI nicety: a task can't be marked delivered
    // without a Drive link on record — enforced here so it holds regardless
    // of which UI path (button, dropdown, or a future API caller) triggers it
    const video = workflowOf(task.workflow) === "video";
    if (video && to === "delivered_and_uploaded" && !driveLink && !task.driveLink) {
      return { error: "Add a Drive link before marking this delivered." };
    }
    // same rule for review: nobody, internal or client, can review a cut
    // there's no link to
    if (workflowOf(task.workflow) !== "todo" && (to === "sent_for_approval" || to === "sent_for_client_approval") && !frameioLink && !task.frameioLink) {
      return { error: "Add the Frame.io link before sending this for approval." };
    }
    // the quality inspection grades a video on first review: the first time
    // core moves it on from Sent for approval (lib/videoScore.ts)
    const grade = needsGrade(task, to, actingRole) ? extras.grade : undefined;
    if (needsGrade(task, to, actingRole) && !isLetter(grade)) return { error: "Grade the video first: S, A+, A, B, C or D." };

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: to,
        // the first time it reaches the client is the editor's deadline met
        handedOffAt: handedOffStamp(task.handedOffAt, to),
        ...(extras.sortOrder !== undefined ? { sortOrder: extras.sortOrder } : {}),
        ...(frameioLink ? { frameioLink } : {}),
        ...(driveLink ? { driveLink } : {}),
        ...(to === "revision_requested"
          ? { reviewedById: actingUserId, reviewNotes: extras.reviewNotes ?? null, revisionCount: { increment: 1 } }
          : {}),
        ...(grade ? { inspectionGrade: grade, inspectedAt: new Date(), inspectedById: actingUserId } : {}),
      },
    });
    // the record the calendar view reads — "this task had activity today"
    await prisma.activityLog.create({
      data: { actorId: actingUserId, action: stageChangeAction(task.status, to), entity: "Task", entityId: taskId },
    });
    // the move (and any grade) changes its scores; a failure here never undoes the move
    await refreshVideoScores([taskId]).catch(() => {});
    revalidatePath("/board");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update status." };
  }
}

// called directly (not via a form) — both the StatusSelect dropdown and
// dragging a card call this exact same function, so they behave identically
export async function moveTask(taskId: string, to: TaskStatus, extras: StatusChangeExtras = {}): Promise<TaskFormState> {
  return changeStatus(taskId, to, extras);
}

// pure manual reordering within a column — no status change, no workflow
// permission check, since this is just "where does this card sit" and
// doesn't touch anything the workflow rules care about
export async function reorderTask(taskId: string, sortOrder: number): Promise<TaskFormState> {
  try {
    // ops arrange anything; an editor only their own cards
    const actor = await sessionActor();
    if (!actor) return { error: "Your session has ended. Please sign in again." };
    const where = actor.role === "employee" ? { id: taskId, assignedToId: actor.id } : { id: taskId };
    const { count } = await prisma.task.updateMany({ where, data: { sortOrder } });
    if (count === 0) return { error: "You can only move your own tasks." };
    revalidatePath("/board");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reorder that task." };
  }
}

// editing details (title/editor/links) — admin & core have full rights to
// tweak everything (see PLAN.md). Editors get exactly one field here: their
// own task's Frame.io link (everything else — title, assignee, raw footage,
// editing notes — is ops' input, not theirs to change; they drive status,
// not task details).
export async function updateTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const taskId = String(formData.get("taskId"));
  const actor = await sessionActor();
  if (!actor) return { error: "Your session has ended. Please sign in again." };

  if (actor.role === "employee") {
    const actingUserId = actor.id;
    // An editor's one editable field is the Frame.io link, and only while
    // the task is waiting on review. A save without that field (the link
    // wasn't opened for editing) changes nothing — it used to clear it.
    if (!formData.has("frameioLink")) return { success: true };
    let frameioLink: string | null;
    try {
      frameioLink = requireLinkOrNull(String(formData.get("frameioLink") ?? ""), "Frame.io link");
    } catch (err) {
      return { error: err instanceof Error ? err.message : "That link isn't valid." };
    }
    // an editor can only touch a task actually assigned to them
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.assignedToId !== actingUserId) {
      return { error: "You can only edit your own tasks." };
    }
    if (task.status !== "sent_for_approval") {
      return { error: "The Frame.io link can only be changed while the task is waiting for review." };
    }
    await prisma.task.update({ where: { id: taskId }, data: { frameioLink } });
    revalidatePath("/board");
    return { success: true };
  }

  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "") || undefined;
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  // a Lead edits the work they can see, and hands it only down the levels
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has ended. Please sign in again." };
  const current = await prisma.task.findFirst({ where: { AND: [{ id: taskId }, assigneeWhere(viewer)] }, select: { assignedToId: true, status: true } });
  if (!current) return { error: "You can't change this task." };
  if (assignedToId && assignedToId !== current.assignedToId && assignedToId !== viewer.id) {
    const target = await prisma.user.findUnique({ where: { id: assignedToId }, select: { id: true, role: true, teamId: true, departments: { select: { id: true } } } });
    if (!target || !canAssign(viewer, { ...target, departmentIds: target.departments.map((d) => d.id) })) {
      return { error: "You can only give work to the Members in your departments." };
    }
  }
  // nothing new goes to someone who's left; a task already on them can
  // still be saved without being handed to anyone else
  if (
    assignedToId &&
    (await prisma.user.findFirst({
      where: { id: assignedToId, employment: "former", tasksAssigned: { none: { id: taskId } } },
      select: { id: true },
    }))
  ) {
    return { error: "That person is no longer on the team. Please choose someone else." };
  }
  // .has() rather than .get() so "field wasn't in the form" (leave it
  // untouched) stays distinct from "field was shown and cleared" (null it).
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
  if (!title) return { error: "Please give the task a title." };

  // reference/asset links only get an input when the task already has one
  // (they arrive from Notion), so the same has()-not-get() rule applies:
  // absent means "leave it alone", present-but-empty means "clear it".
  let referenceLink: string | null | undefined;
  let assetLink: string | null | undefined;
  try {
    referenceLink = formData.has("referenceLink")
      ? requireLinkOrNull(String(formData.get("referenceLink") ?? ""), "Reference link")
      : undefined;
    assetLink = formData.has("assetLink")
      ? requireLinkOrNull(String(formData.get("assetLink") ?? ""), "Assets link")
      : undefined;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }

  // tagIds arrives as one entry per checked tag; `set` replaces the whole
  // list, so unchecking really does remove. The hidden "tagsPresent" marker
  // distinguishes "the form had no tag section" from "every tag unchecked".
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const internal = formData.get("internal") === "on";

  // yyyy-mm-dd or empty (cleared); absent means the form didn't show it
  const day = (name: string): Date | null | undefined => {
    if (!formData.has(name)) return undefined;
    const v = String(formData.get(name) ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : null;
  };
  const dueDate = day("dueDate");
  const deliveryDate = day("deliveryDate");
  const postDate = day("postDate");
  const scheduledFor = day("scheduledFor");

  // an editor's work is measured by its type, so it needs one
  const assignee = assignedToId ? await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true, team: { select: { slug: true } } } }) : null;
  if (assignee && editsVideos(assignee)) {
    const typed = formData.has("tagsPresent") ? tagIds.length > 0 : (await prisma.task.count({ where: { id: taskId, tags: { some: {} } } })) > 0;
    if (!typed) return { error: TYPE_NEEDED };
  }

  // a new kind of work can change how it moves, if its stage fits the new one
  const placed = formData.has("tagsPresent") ? await placeTask(tagIds, assignedToId) : null;
  const replace = placed && WORKFLOW_STAGES[placed.workflow].includes(current.status) ? placed : placed && { teamId: placed.teamId };

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title,
      projectId,
      assignedToId,
      ...(replace ?? {}),
      rawLink,
      editingNotes,
      ...(frameioLink !== undefined ? { frameioLink } : {}),
      ...(driveLink !== undefined ? { driveLink } : {}),
      ...(referenceLink !== undefined ? { referenceLink } : {}),
      ...(assetLink !== undefined ? { assetLink } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
      ...(deliveryDate !== undefined ? { deliveryDate } : {}),
      ...(postDate !== undefined ? { postDate } : {}),
      ...(scheduledFor !== undefined ? { scheduledFor } : {}),
      // internal work never goes to the client, so it loses any delivery day
      ...(formData.has("tagsPresent")
        ? { tags: { set: tagIds.map((id) => ({ id })) }, internal, ...(internal ? { deliveryDate: null, postDate: null } : {}) }
        : {}),
    },
  });
  revalidatePath("/board");
  revalidatePath("/clients");
  return { success: true };
}

// Every tag, for the pickers. Ordered the way taskTags.ts seeds them so the
// list reads client-facing work first, internal work after.
export async function listTaskTags() {
  if (!(await getSessionUserId())) return [];
  return prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

// Ops adding a kind of work that wasn't in the seed list. It lands on the
// creator's own team, so a Sales tag stays in Sales. New tags default to
// client-facing — the common case — and can be flipped later.
export async function createTaskTag(name: string): Promise<{ error?: string; tag?: { id: string; name: string; clientFacing: boolean; group: string | null } }> {
  const user = await requireOps();
  if (!user) return { error: "Only the operations team can add a tag." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the tag a name." };

  const existing = await prisma.taskTag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return { error: `"${existing.name}" already exists.` };

  const last = await prisma.taskTag.findFirst({ orderBy: { sortOrder: "desc" } });
  const tag = await prisma.taskTag.create({
    data: { name: trimmed, teamId: user.teamId, sortOrder: (last?.sortOrder ?? 0) + 1 },
    include: { team: { select: { name: true } } },
  });
  revalidatePath("/board");
  revalidatePath("/my-tasks");
  return { tag: { id: tag.id, name: tag.name, clientFacing: tag.clientFacing, group: tag.team?.name ?? null } };
}

// A core member curates their own team's vocabulary; admin curates anyone's.
// The tag is detached from whatever already carries it rather than blocking
// the delete — the tasks themselves are the record, the label is just how
// they're grouped.
export async function deleteTaskTag(tagId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only the operations team can remove a tag." };

  const tag = await prisma.taskTag.findUnique({ where: { id: tagId }, select: { teamId: true } });
  if (!tag) return { error: "That tag is already gone." };
  const viewer = await getViewer();
  if (!viewer || !canEditTag(viewer, tag)) {
    return { error: "That tag belongs to another team." };
  }

  await prisma.taskTag.delete({ where: { id: tagId } });
  revalidatePath("/board");
  revalidatePath("/my-tasks");
  return {};
}

export async function deleteTask(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const actor = await sessionActor();
  if (!actor || actor.role === "employee") throw new Error("Only admins and core team members can delete tasks.");

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/board");
}

// Several at once, from the list view's selection. Same bar as deleting one
// (admin/core), and one query rather than one per task — picking ten rows
// and deleting them one at a time is exactly what the selection is for.
export async function deleteTasks(taskIds: string[]): Promise<{ deleted?: number; error?: string }> {
  const actor = await sessionActor();
  if (!actor || actor.role === "employee") return { error: "Only admins and core team members can delete tasks." };
  const ids = taskIds.filter(Boolean);
  if (ids.length === 0) return { deleted: 0 };

  const { count } = await prisma.task.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/board");
  revalidatePath("/history");
  return { deleted: count };
}

// Permanently wipes a task and everything referencing it — for cleaning
// dummy/test rows out of History, not something ops reaches for on real
// client work (that's what deleteTask above is for, and it's reversible in
// spirit since the task is still "real"; this one leaves nothing behind).
// Admin and Abhishek only, checked against the signed-in session. Either
// kind of task: someone's own work ("internal") has nothing hanging off it
// but its tags, which go with it.
export async function deleteTaskPermanently(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const own = formData.get("kind") === "internal";
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    throw new Error("Only Abhishek or an admin can permanently delete a task.");
  }

  if (own) {
    await prisma.workTask.delete({ where: { id: taskId } });
    revalidatePath("/history");
    revalidatePath("/team");
    return;
  }
  await prisma.$transaction([
    prisma.feedback.deleteMany({ where: { taskId } }),
    prisma.activityLog.deleteMany({ where: { entity: "Task", entityId: taskId } }),
    prisma.task.delete({ where: { id: taskId } }),
  ]);
  revalidatePath("/history");
}

// Their Notion "Status" options, verified directly against the database
// schema — nearly identical to our own TaskStatus, just Notion's own
// display casing/spacing.
// Notion's authority stops at "Sent for Client Approval". Everything past
// that — the client's verdict, the final export, the delivery — happens
// here, and the Notion row is abandoned at whatever the editor last set it
// to. So a row further along than this is not news about that task; it's a
// stale column, and taking it would drag finished work back onto the board.
const NOTION_LAST_STAGE: TaskStatus = "sent_for_client_approval";
const fromNotionAllowed = (status: TaskStatus) =>
  ALL_STATUSES.indexOf(status) <= ALL_STATUSES.indexOf(NOTION_LAST_STAGE);

const NOTION_STATUS_MAP: Record<string, TaskStatus> = {
  queued: "queued",
  editing: "editing",
  "sent for approval": "sent_for_approval",
  // "Sent for Client Approval" is its own stage: past our internal review,
  // now waiting on the client. It used to be folded into Final export ready
  // for want of a column — it has one of its own now.
  "sent for client approval": "sent_for_client_approval",
  "revision requested": "revision_requested",
  // every column Notion has, onto the column of the same name here — a row
  // sitting in "Final export ready" there belongs in that column here, not
  // filed away in History as though it had shipped
  "final export ready": "final_export_ready",
  "delivered and uploaded": "delivered_and_uploaded",
};

// Notion has one "Exported Link" column that holds different things at
// different stages: a Frame.io review link while the cut is under review,
// and the final Google Drive link once it's delivered. Filing all of them
// as frameioLink (what this used to do) meant a delivered task's Drive
// link showed up labelled "Frame.io" and the Drive field stayed empty.
// Route by what the URL actually is, and never clear the other field —
// both are real, they just arrive at different times.
function routeExportedLink(url: string | null): { frameioLink?: string; driveLink?: string } {
  if (!url) return {};
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return {};
  }
  if (host.includes("drive.google.com") || host.includes("docs.google.com")) return { driveLink: url };
  return { frameioLink: url };
}

// The Notion "Editor" person is tied to their own Notion account name,
// which may be a first name only ("Sparsh") or full name ("Narendra
// Mehta") — exact match first, first-name fallback second.
function matchEditor<T extends { name: string }>(personName: string, editors: T[]): T | undefined {
  const p = personName.trim().toLowerCase();
  return (
    editors.find((e) => e.name.toLowerCase() === p) ??
    editors.find((e) => e.name.toLowerCase().startsWith(p) || p.startsWith(e.name.toLowerCase().split(" ")[0]))
  );
}

// Temporary — manual, admin-triggered pull from Notion while the team is
// still creating tasks there during the transition. Never automatic (no
// cron, no webhook): only runs when this is called from the button.
// Remove this whole function, lib/notion.ts, the button, and the
// notionPageId column together once Notion is retired.
export type NotionSyncResult = {
  created: number;
  updated: number;
  // rows sent *up* to Notion — created there, or had their status and links
  // refreshed because this app owns them
  pushed: number;
  skipped: number;
  skippedReasons: string[];
  error?: string;
};

// Notion → here. Every row it can match is written onto our task, so what
// Notion says wins; our own values go the other way with pushToNotion.
export async function syncFromNotion(): Promise<NotionSyncResult> {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    return { created: 0, updated: 0, pushed: 0, skipped: 0, skippedReasons: [], error: "Only Abhishek or an admin can sync Notion." };
  }

  try {
    const [rows, editors, clients] = await Promise.all([
      fetchTaskRows(),
      // someone who has left can't be handed a task, even by Notion
      prisma.user.findMany({ where: { role: "employee", employment: { not: "former" } } }),
      prisma.client.findMany({ include: { projects: true } }),
    ]);

    // one query for every already-imported row instead of one round-trip
    // per row — with the sync scoped to just today, rows is small, but no
    // reason to make it N queries when it's this easy to make it one
    const mirrored = await prisma.task.findMany({
      where: { notionPageId: { in: rows.map((r) => r.id) } },
      select: { id: true, notionPageId: true, status: true, handedOffAt: true },
    });
    const statusById = new Map(mirrored.map((t) => [t.id, t.status]));
    const handedOffById = new Map(mirrored.map((t) => [t.id, t.handedOffAt]));
    const existingByNotionId = new Map(mirrored.map((t) => [t.notionPageId, t.id]));

    // Which of those the team has since moved themselves. Notion's column is
    // where a task comes *in*; once someone here has moved it, this board is
    // where that task's stage lives and a sync no longer overwrites it.
    // Without this, an editor who stops updating Notion once they've exported
    // (which is what they do) drags the task back to "Final export ready"
    // every sync — including out of History, days after it was delivered.
    const stageLogs = await prisma.activityLog.findMany({
      where: { entity: "Task", entityId: { in: mirrored.map((t) => t.id) }, action: { contains: "→" } },
      select: { entityId: true, action: true },
    });
    const byHand = new Set<string>();
    for (const [id, actions] of Object.entries(
      stageLogs.reduce<Record<string, string[]>>((acc, l) => {
        (acc[l.entityId] ??= []).push(l.action);
        return acc;
      }, {})
    )) {
      if (movedByHand(actions)) byHand.add(id);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    // grouped, not one line per row: with a few hundred rows in that
    // database, "couldn't match a client" 28 times is noise, and the one
    // line that says which 28 is what anyone acts on
    const skips = new Map<string, string[]>();
    const skip = (reason: string, title: string) => {
      skipped++;
      skips.set(reason, [...(skips.get(reason) ?? []), title]);
    };

    for (const row of rows) {
      const title = getTitleText(row.properties);
      if (!title) {
        skip("with no title in Notion", "(untitled)");
        continue;
      }

      const client = matchClient(title, clients);
      const project = client?.projects[0];
      if (!project) {
        skip("need a client that doesn't exist here yet", title);
        continue;
      }

      // no Editor set in Notion is normal — plenty of rows are queued
      // before anyone picks them up. The task still belongs on the board,
      // unassigned, rather than vanishing because of a blank column.
      const editorName = getFirstPersonName(row.properties, "Editor");
      const editor = editorName ? matchEditor(editorName, editors) : undefined;

      const statusName = getStatusName(row.properties);
      const status = statusName ? NOTION_STATUS_MAP[statusName.toLowerCase()] : undefined;
      const sharedData = {
        title,
        status: status ?? "queued",
        // only overwrite who it's assigned to when Notion actually names
        // someone — a blank column there shouldn't unassign work that was
        // handed out here
        ...(editor ? { assignedToId: editor.id } : {}),
        rawLink: getUrl(row.properties, "Raw Links"),
        referenceLink: getUrl(row.properties, "Reference "),
        assetLink: getUrl(row.properties, "Assets"),
        ...routeExportedLink(getUrl(row.properties, "Exported Link")),
      };

      // already tracked. The title and links always come across — Notion is
      // where the editor keeps them. The stage and who it's assigned to only
      // come across while nobody here has moved the task: after that this
      // board is where its stage lives, and a stale Notion column (an editor
      // who exported and never touched the row again) must not drag it
      // backwards, least of all out of History.
      const existingId = existingByNotionId.get(row.id);
      if (existingId) {
        // the board owns it once someone here has moved it, and Notion
        // never speaks for a stage past its own last one
        const ours = byHand.has(existingId) || !fromNotionAllowed(sharedData.status);
        const { status: notionStatus, assignedToId, ...rest } = sharedData;
        await prisma.task.update({
          where: { id: existingId },
          data: ours
            ? rest
            : {
                ...rest,
                status: notionStatus,
                // stamped with when the row changed in Notion, not when this
                // sync happened to notice — a sync a day later would
                // otherwise make an editor who sent it on time look late
                handedOffAt: handedOffStamp(
                  handedOffById.get(existingId) ?? null,
                  notionStatus,
                  row.last_edited_time ? new Date(row.last_edited_time) : new Date()
                ),
                ...(assignedToId ? { assignedToId } : {}),
              },
        });
        // a stage change made in Notion goes in the log like any other, so
        // History and the editor export see it — marked as Notion's, so a
        // later sync can still tell it apart from the team's own moves
        const before = statusById.get(existingId);
        if (!ours && before && before !== notionStatus) {
          await prisma.activityLog.create({
            data: {
              actorId: user.id,
              action: stageChangeAction(before, notionStatus, true),
              entity: "Task",
              entityId: existingId,
            },
          });
        }
        updated++;
        continue;
      }

      // not tracked here yet. A row still moving through Notion's half of
      // the pipeline comes onto the board in the column its status names,
      // whatever day it was queued — that's the whole point of the button.
      // A row already past that is work this app never handled: importing
      // it would land finished videos straight into History as though we'd
      // just shipped them.
      if (!fromNotionAllowed(sharedData.status)) {
        skip(`already past ${STAGE[NOTION_LAST_STAGE].label} in Notion`, title);
        continue;
      }

      const queuedOn = getDate(row.properties, "Editor Queu Date");
      const importedAt = new Date();
      await prisma.task.create({
        data: {
          ...sharedData,
          // Already with the client when it arrived: nobody saw it get there,
          // so it's stamped with the same instant as its creation, which is
          // how lib/due's handoffUnknown tells it apart from a real handoff.
          createdAt: importedAt,
          handedOffAt: handedOffStamp(null, sharedData.status, importedAt),
          projectId: project.id,
          dueDate: queuedOn ?? new Date(),
          // newest at the top of its column, same as the board's own order
          sortOrder: queuedOn?.getTime() ?? Date.now(),
          notionPageId: row.id,
        },
      });
      created++;
    }

    const skippedReasons = [...skips].map(([reason, titles]) => {
      const shown = titles.slice(0, 4).join(", ");
      return `${titles.length} ${reason}: ${shown}${titles.length > 4 ? `, and ${titles.length - 4} more` : ""}`;
    });

    if (created > 0 || updated > 0) revalidatePath("/board");
    return { created, updated, pushed: 0, skipped, skippedReasons };
  } catch (err) {
    return {
      created: 0,
      updated: 0,
      pushed: 0,
      skipped: 0,
      skippedReasons: [],
      error: err instanceof Error ? err.message : "Notion sync failed.",
    };
  }
}

// polled by ApprovalWatcher independent of whatever workspace page is
// actually showing — an editor camped on History or Calendar should still
// get told the moment one of their tasks is delivered, not only when
// they happen to be looking at the Board
// Always the signed-in person's own tasks — never whoever the caller names.
// Here → Notion: every editing-queue task we hold, written onto its row's
// fields — the page updated if it already has one, created if it doesn't.
// The mirror image of syncFromNotion above; nothing comes down.
export async function pushToNotion(): Promise<NotionSyncResult> {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    return { created: 0, updated: 0, pushed: 0, skipped: 0, skippedReasons: [], error: "Only Abhishek or an admin can push to Notion." };
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          // a row already in the queue is kept current whatever stage it's
          // reached, delivered included — that's how Notion learns the work
          // shipped. Leaving delivered tasks out is what left its rows stuck
          // at "Final export ready" months after the client had the file.
          { notionPageId: { not: null } },
          // and anything still live that belongs there but isn't yet: the
          // same people as pushesToNotion — Production and Client success
          { status: { in: ACTIVE_STATUSES }, workflow: "video", assignedTo: { team: { slug: { in: ["production", "client-success"] } } } },
        ],
      },
      select: { id: true, title: true, notionPageId: true },
      orderBy: { createdAt: "asc" },
      take: 400,
    });

    let created = 0;
    let pushed = 0;
    const skippedReasons: string[] = [];

    for (const t of tasks) {
      const res = t.notionPageId ? await updateInNotion(t.id) : await createInNotion(t.id);
      if (res.error) skippedReasons.push(`"${t.title}": ${res.error}`);
      else if (t.notionPageId) pushed++;
      else created++;
    }

    if (created > 0) revalidatePath("/board"); // new rows now carry a Notion id
    return { created, updated: 0, pushed, skipped: skippedReasons.length, skippedReasons: skippedReasons.slice(0, 20) };
  } catch (err) {
    return {
      created: 0,
      updated: 0,
      pushed: 0,
      skipped: 0,
      skippedReasons: [],
      error: err instanceof Error ? err.message : "Couldn't push to Notion.",
    };
  }
}


// on-demand, not preloaded onto every task in a board fetch — most cards'
// trails never get opened, so fetching all of them up front would be pure
// waste. The "created" row (always first, since logs are oldest-first) is
// exactly "assigned on this date by this person" — no separate field needed.
export async function getTaskActivity(taskId: string) {
  if (!(await getSessionUserId())) return [];
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: taskId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return logs.map((log) => ({ createdAt: log.createdAt, action: log.action, actorName: log.actor.name }));
}

// ---- delivering a finished file ----
//
// When a task is marked delivered, the Drive link is usually pasted by hand
// because the team often re-renders at full quality rather than shipping
// what's on Frame.io. Sometimes the Frame.io original IS the final file, and
// then copying it across by hand is pure busywork — so this offers it, with
// the file's name and size on screen, and never does it unasked. The
// judgement about quality stays with the person delivering.

export type DeliverableFile = {
  id: string;
  name: string;
  size: number | null;
  ready: boolean;
  destination: string;
};

// What's on the other end of this task's review link, and where it would go.
export async function frameioFileForTask(
  taskId: string
): Promise<{ files?: DeliverableFile[]; error?: string }> {
  const actor = await sessionActor();
  if (!actor) return { error: "Your session has ended. Please sign in again." };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { frameioLink: true, project: { select: { name: true, type: true, client: { select: { name: true } } } } },
  });
  if (!task) return { error: "This task no longer exists." };
  if (!task.frameioLink) return { error: "This task has no Frame.io link." };
  if (!(await frameioConnected())) return { error: "Frame.io isn't connected yet. An admin can connect it under Integrations." };

  try {
    const shareId = await shareIdFrom(task.frameioLink);
    if (!shareId) return { error: "That Frame.io link doesn't lead to a share." };
    const files = await shareFiles(shareId);
    if (files.length === 0) return { error: "That Frame.io share has no files in it." };

    const destination = `${task.project.client.name} / ${task.project.name || task.project.type}`;
    return { files: files.map((f) => ({ id: f.id, name: f.name, size: f.size, ready: f.ready, destination })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach Frame.io." };
  }
}

// Copies it, and hands back the Drive link so the delivery can carry it.
export async function copyFrameioFileToDrive(
  taskId: string,
  fileId: string
): Promise<{ url?: string; path?: string; error?: string }> {
  const actor = await sessionActor();
  if (!actor) return { error: "Your session has ended. Please sign in again." };
  if (actor.role === "employee") return { error: "Only the core team can deliver a file." };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { frameioLink: true, project: { select: { name: true, type: true, client: { select: { name: true } } } } },
  });
  if (!task?.frameioLink) return { error: "This task has no Frame.io link." };

  try {
    const shareId = await shareIdFrom(task.frameioLink);
    if (!shareId) return { error: "That Frame.io link doesn't lead to a share." };
    // re-listed rather than trusting what the prompt was showing: these
    // download addresses are signed and short-lived
    const file = (await shareFiles(shareId)).find((f) => f.id === fileId);
    if (!file) return { error: "That file is no longer in the share." };
    if (!file.downloadUrl || !file.ready) return { error: "Frame.io hasn't finished processing that file yet." };

    const folder = await exportFolder(task.project.client.name, task.project.name || task.project.type);
    const uploaded = await uploadFromUrl(
      file.downloadUrl,
      { name: file.name, type: file.mediaType ?? "video/mp4", size: file.size ?? 0 },
      folder.id
    );
    return { url: uploaded.url, path: `${folder.path} / ${file.name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't copy that file." };
  }
}
