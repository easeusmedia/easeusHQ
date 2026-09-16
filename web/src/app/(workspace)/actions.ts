"use server";

import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, canTransition, type Role, type TaskStatus } from "@/lib/workflow";
import { revalidatePath } from "next/cache";
import { destroySession, getSessionUserId, requireOps } from "@/lib/auth";
import { canEditTag } from "@/lib/scope";
import { createInNotion, pushesToNotion, updateInNotion } from "@/lib/notionPush";
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
// call. The pages still pass an "acting" user to the UI (so "viewing as"
// can preview someone's permissions), but what a request may do is decided
// here, by who actually sent it. An editor claiming to be admin in a form
// used to be taken at their word.
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

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const actor = await sessionActor();
  if (!actor) return { error: "You're not signed in." };
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
  if (actor.role === "employee" && assignedToId !== actor.id) {
    return { error: "You can only add tasks for yourself." };
  }
  const dueDateInput = String(formData.get("dueDate") ?? "").trim();
  const scheduledForInput = String(formData.get("scheduledFor") ?? "").trim();

  const assignee = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { role: true, employment: true, team: { select: { slug: true } } },
  });
  if (!assignee || assignee.employment === "former") {
    return { error: "That person is no longer with the team — pick someone else." };
  }

  const task = await prisma.task.create({
    // sortOrder: Date.now() puts new cards after every existing one (which
    // default to 0) without needing to query the column's current max
    data: {
      projectId,
      title: title.trim(),
      // when it needs to reach the client for approval by, not when it was created
      dueDate: dueDateInput ? new Date(dueDateInput) : null,
      // hidden from the assigned editor until this date — see the schema comment
      scheduledFor: scheduledForInput ? new Date(scheduledForInput) : null,
      assignedToId,
      rawLink,
      referenceLink,
      editingNotes,
      sortOrder: Date.now(),
      internal: formData.get("internal") === "on",
      tags: { connect: formData.getAll("tagIds").map(String).filter(Boolean).map((id) => ({ id })) },
    },
    // status defaults to "queued"
  });

  await prisma.activityLog.create({ data: { actorId: actor.id, action: "created", entity: "Task", entityId: task.id } });

  // Mirror it into Notion's Editing Queue, for the people whose work lives
  // there. Deliberately not awaited for correctness: if Notion is slow or
  // down, the task is still created here and the next sync picks it up as
  // unmirrored — creating a task must never depend on someone else's API.
  if (pushesToNotion({ role: assignee.role, teamSlug: assignee.team?.slug ?? null })) {
    await createInNotion(task.id).catch(() => {});
  }

  revalidatePath("/board");
  return { success: true };
}

type StatusChangeExtras = { frameioLink?: string; driveLink?: string; reviewNotes?: string; sortOrder?: number };

// Returns {error} instead of throwing — moveTask/reorderTask are called
// directly from client code (not a <form action>), and a thrown Server
// Action error gets its message redacted to a generic "Minified React
// error #441" digest in production (Next.js only preserves the message
// for an error a form action returns, not one it throws). Same reason
// createTask/updateTask were converted earlier.
async function changeStatus(taskId: string, to: TaskStatus, extras: StatusChangeExtras): Promise<TaskFormState> {
  try {
    const actor = await sessionActor();
    if (!actor) return { error: "You're not signed in." };
    const actingUserId = actor.id;
    const actingRole = actor.role as Role;
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
    // same rule for review: nobody, internal or client, can review a cut
    // there's no link to
    if ((to === "sent_for_approval" || to === "sent_for_client_approval") && !frameioLink && !task.frameioLink) {
      return { error: "Add the Frame.io link before sending this for approval." };
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
    if (!actor) return { error: "You're not signed in." };
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
  if (!actor) return { error: "You're not signed in." };

  if (actor.role === "employee") {
    const actingUserId = actor.id;
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
    await prisma.task.update({ where: { id: taskId }, data: { frameioLink } });
    revalidatePath("/board");
    return { success: true };
  }

  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "") || undefined;
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  // nothing new goes to someone who's left; a task already on them can
  // still be saved without being handed to anyone else
  if (
    assignedToId &&
    (await prisma.user.findFirst({
      where: { id: assignedToId, employment: "former", tasksAssigned: { none: { id: taskId } } },
      select: { id: true },
    }))
  ) {
    return { error: "That person is no longer with the team — pick someone else." };
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
  if (!title) return { error: "Title is required" };

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
  const scheduledFor = day("scheduledFor");

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
      ...(referenceLink !== undefined ? { referenceLink } : {}),
      ...(assetLink !== undefined ? { assetLink } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
      ...(scheduledFor !== undefined ? { scheduledFor } : {}),
      ...(formData.has("tagsPresent") ? { tags: { set: tagIds.map((id) => ({ id })) }, internal } : {}),
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
export async function createTaskTag(name: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can add a tag." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the tag a name." };

  const existing = await prisma.taskTag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return { error: `"${existing.name}" already exists.` };

  const last = await prisma.taskTag.findFirst({ orderBy: { sortOrder: "desc" } });
  await prisma.taskTag.create({
    data: { name: trimmed, teamId: user.teamId, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/board");
  revalidatePath("/my-tasks");
  return {};
}

// A core member curates their own team's vocabulary; admin curates anyone's.
// The tag is detached from whatever already carries it rather than blocking
// the delete — the tasks themselves are the record, the label is just how
// they're grouped.
export async function deleteTaskTag(tagId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can remove a tag." };

  const tag = await prisma.taskTag.findUnique({ where: { id: tagId }, select: { teamId: true } });
  if (!tag) return { error: "That tag is already gone." };
  if (!canEditTag({ id: user.id, role: user.role, email: user.email, teamId: user.teamId }, tag)) {
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
  if (!actor || actor.role === "employee") throw new Error("Only admin/core can delete a task");

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/board");
}

// Permanently wipes a task and everything referencing it — for cleaning
// dummy/test rows out of History, not something ops reaches for on real
// client work (that's what deleteTask above is for, and it's reversible in
// spirit since the task is still "real"; this one leaves nothing behind).
// Admin and Abhishek only, checked against the signed-in session.
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
  revalidatePath("/history");
}

// Their Notion "Status" options, verified directly against the database
// schema — nearly identical to our own TaskStatus, just Notion's own
// display casing/spacing.
const NOTION_STATUS_MAP: Record<string, TaskStatus> = {
  queued: "queued",
  editing: "editing",
  "sent for approval": "sent_for_approval",
  // "Sent for Client Approval" is its own stage: past our internal review,
  // now waiting on the client. It used to be folded into Final export ready
  // for want of a column — it has one of its own now.
  "sent for client approval": "sent_for_client_approval",
  "revision requested": "revision_requested",
  // Notion's "Final export ready" means the team has exported and handed
  // the work over — it's done, and it should drop off the board into
  // History on sync rather than sitting in an active column forever.
  // (Our own board still has a separate final_export_ready stage for work
  // driven here rather than in Notion; this is only how *Notion's* wording
  // maps in.)
  "final export ready": "delivered_and_uploaded",
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

// Same duplicated-on-purpose IST-offset approach as notion.ts's own
// todayInIST() — this file doesn't otherwise need to know about Notion's
// date handling, so it isn't worth importing/exporting just for this.
function isToday(d: Date | null): boolean {
  if (!d) return false;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const toISTDateString = (x: Date) => new Date(x.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return toISTDateString(d) === toISTDateString(new Date());
}

// Client isn't its own property — it's the prefix before " - " in the
// title ("CL - Energy - Katie." -> "CL", "Tego - Skin Business" -> "Tego").
// "CL" is initials ("Courageous Leaders"); "Tego" is a plain substring of
// "Dr Tego" — so try both, in that order.
function matchClient<T extends { name: string }>(prefix: string, clients: T[]): T | undefined {
  const p = prefix.trim().toLowerCase();
  if (!p) return undefined;
  const exact = clients.find((c) => c.name.toLowerCase() === p);
  if (exact) return exact;
  if (/^[A-Za-z]{2,4}$/.test(prefix.trim())) {
    const initials = clients.find(
      (c) =>
        c.name
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .toLowerCase() === p
    );
    if (initials) return initials;
  }
  return clients.find((c) => c.name.toLowerCase().includes(p) || p.includes(c.name.toLowerCase()));
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

export async function syncFromNotion(): Promise<NotionSyncResult> {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    return { created: 0, updated: 0, pushed: 0, skipped: 0, skippedReasons: [], error: "Only Abhishek or an admin can sync Notion." };
  }

  try {
    const [rows, editors, clients] = await Promise.all([
      fetchTaskRows(),
      prisma.user.findMany({ where: { role: "employee" } }),
      prisma.client.findMany({ include: { projects: true } }),
    ]);

    // one query for every already-imported row instead of one round-trip
    // per row — with the sync scoped to just today, rows is small, but no
    // reason to make it N queries when it's this easy to make it one
    const mirrored = await prisma.task.findMany({
      where: { notionPageId: { in: rows.map((r) => r.id) } },
      select: { id: true, notionPageId: true, notionCreatedByApp: true, status: true },
    });
    const statusById = new Map(mirrored.map((t) => [t.id, t.status]));
    const existingByNotionId = new Map(mirrored.map((t) => [t.notionPageId, t.id]));
    const appOwned = new Set(mirrored.filter((t) => t.notionCreatedByApp).map((t) => t.id));

    let created = 0;
    let updated = 0;
    let pushed = 0;
    let skipped = 0;
    const skippedReasons: string[] = [];

    for (const row of rows) {
      const title = getTitleText(row.properties);
      if (!title) {
        skipped++;
        skippedReasons.push("a row with no title");
        continue;
      }

      const editorName = getFirstPersonName(row.properties, "Editor");
      const editor = editorName ? matchEditor(editorName, editors) : undefined;
      if (!editor) {
        skipped++;
        skippedReasons.push(`"${title}": couldn't match editor "${editorName ?? "(none)"}"`);
        continue;
      }

      const clientPrefix = title.split(" - ")[0];
      const client = matchClient(clientPrefix, clients);
      const project = client?.projects[0];
      if (!project) {
        skipped++;
        skippedReasons.push(`"${title}": couldn't match a client ("${clientPrefix}")`);
        continue;
      }

      const statusName = getStatusName(row.properties);
      const status = statusName ? NOTION_STATUS_MAP[statusName.toLowerCase()] : undefined;
      const sharedData = {
        title,
        status: status ?? "queued",
        assignedToId: editor.id,
        rawLink: getUrl(row.properties, "Raw Links"),
        referenceLink: getUrl(row.properties, "Reference "),
        assetLink: getUrl(row.properties, "Assets"),
        ...routeExportedLink(getUrl(row.properties, "Exported Link")),
      };

      // already tracked — Notion is the source of truth during this
      // testing phase, so keep the status (and links) in sync with
      // whatever it currently shows there, rather than only ever creating
      // once and then ignoring later changes made in Notion. This is the
      // one thing allowed to reach back past today: an already-tracked
      // task that's fallen behind (still shows an old status here) should
      // still catch up regardless of which day it was originally queued.
      const existingId = existingByNotionId.get(row.id);
      if (existingId) {
        // A row this app created is ours to drive: its status and links go
        // *up*, and nothing comes down over the top of them. Rows that came
        // from Notion still pull down, as before. One owner per row, so a
        // status changed here can't be reverted by the next sync and a
        // status changed in Notion can't be clobbered by this one.
        if (appOwned.has(existingId)) {
          const res = await updateInNotion(existingId);
          if (res.error) skippedReasons.push(`"${title}": couldn't push to Notion — ${res.error}`);
          else pushed++;
          continue;
        }
        await prisma.task.update({ where: { id: existingId }, data: sharedData });
        // a stage change made in Notion goes in the log like any other, so
        // History and the editor export see it; stamped at sync time, which
        // is as close as we can know
        const before = statusById.get(existingId);
        if (before && before !== sharedData.status) {
          await prisma.activityLog.create({
            data: { actorId: user.id, action: `${before} → ${sharedData.status}`, entity: "Task", entityId: existingId },
          });
        }
        updated++;
        continue;
      }

      // not already tracked — only create it if it's actually dated today.
      // The date filter above reaches back further than today (on_or_before)
      // so the update path can catch up on stale-but-tracked tasks, but that
      // meant a still-untracked older row (e.g. one already sitting at
      // "Delivered and uploaded" from days ago) got freshly created and
      // dropped straight into History without ever having been on the
      // board — exactly the backfill this button was built to avoid.
      const dueDate = getDate(row.properties, "Editor Queu Date");
      if (!isToday(dueDate)) {
        skipped++;
        skippedReasons.push(`"${title}": not dated today, skipping (only today's new tasks get created)`);
        continue;
      }

      await prisma.task.create({
        data: {
          ...sharedData,
          projectId: project.id,
          dueDate: dueDate ?? new Date(),
          sortOrder: Date.now(),
          notionPageId: row.id,
        },
      });
      created++;
    }

    // Anything created here while Notion was unreachable (or before this
    // existed) has no page yet — give it one now. Scoped to the same people
    // whose work belongs in the Editing Queue.
    const unmirrored = await prisma.task.findMany({
      where: {
        notionPageId: null,
        status: { in: ACTIVE_STATUSES },
        assignedTo: { role: { not: "admin" }, team: { slug: "operations" } },
      },
      select: { id: true, title: true },
      take: 50,
    });
    for (const t of unmirrored) {
      const res = await createInNotion(t.id);
      if (res.error) skippedReasons.push(`"${t.title}": couldn't create in Notion — ${res.error}`);
      else pushed++;
    }

    if (created > 0 || updated > 0 || pushed > 0) revalidatePath("/board");
    return { created, updated, pushed, skipped, skippedReasons: skippedReasons.slice(0, 20) };
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
export async function getMyActiveTaskSnapshot() {
  const userId = await getSessionUserId();
  if (!userId) return [];
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
  if (!(await getSessionUserId())) return [];
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: taskId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return logs.map((log) => ({ createdAt: log.createdAt, action: log.action, actorName: log.actor.name }));
}
