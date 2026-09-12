"use server";

import { prisma } from "@/lib/prisma";
import { canTransition, type Role, type TaskStatus } from "@/lib/workflow";
import { revalidatePath } from "next/cache";
import { destroySession, getSessionUserId } from "@/lib/auth";
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

// editing details (title/editor/links) — admin & core have full rights to
// tweak everything (see PLAN.md). Editors get exactly one field here: their
// own task's Frame.io link (everything else — title, assignee, raw footage,
// editing notes — is ops' input, not theirs to change; they drive status,
// not task details).
export async function updateTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const taskId = String(formData.get("taskId"));
  const actingRole = String(formData.get("actingRole")) as Role;

  if (actingRole === "employee") {
    const actingUserId = String(formData.get("actingUserId") ?? "");
    let frameioLink: string | null;
    try {
      frameioLink = requireLinkOrNull(String(formData.get("frameioLink") ?? ""), "Frame.io link");
    } catch (err) {
      return { error: err instanceof Error ? err.message : "That link isn't valid." };
    }
    // re-derived server-side, not trusted from the client — an editor can
    // only touch a task actually assigned to them
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.assignedToId !== actingUserId) {
      return { error: "You can only edit your own tasks." };
    }
    await prisma.task.update({ where: { id: taskId }, data: { frameioLink } });
    revalidatePath("/tasks");
    return { success: true };
  }

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

// Their Notion "Status" options, verified directly against the database
// schema — nearly identical to our own TaskStatus, just Notion's own
// display casing/spacing.
const NOTION_STATUS_MAP: Record<string, TaskStatus> = {
  queued: "queued",
  editing: "editing",
  "sent for approval": "sent_for_approval",
  // "Sent for Client Approval" means it already passed our own review and
  // is sitting with the client for sign-off — that's further along than
  // "Sent for approval" (ops hasn't even reviewed it yet), so it belongs
  // in Final export ready, not the same column.
  "sent for client approval": "final_export_ready",
  "revision requested": "revision_requested",
  "final export ready": "final_export_ready",
  "delivered and uploaded": "delivered_and_uploaded",
};

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
  skipped: number;
  skippedReasons: string[];
  error?: string;
};

export async function syncFromNotion(): Promise<NotionSyncResult> {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) {
    return { created: 0, updated: 0, skipped: 0, skippedReasons: [], error: "Only Abhishek or an admin can sync Notion." };
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
    const existingByNotionId = new Map(
      (
        await prisma.task.findMany({
          where: { notionPageId: { in: rows.map((r) => r.id) } },
          select: { id: true, notionPageId: true },
        })
      ).map((t) => [t.notionPageId, t.id])
    );

    let created = 0;
    let updated = 0;
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
        frameioLink: getUrl(row.properties, "Exported Link"),
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
        await prisma.task.update({ where: { id: existingId }, data: sharedData });
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

    if (created > 0 || updated > 0) revalidatePath("/tasks");
    return { created, updated, skipped, skippedReasons: skippedReasons.slice(0, 20) };
  } catch (err) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      skippedReasons: [],
      error: err instanceof Error ? err.message : "Notion sync failed.",
    };
  }
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
