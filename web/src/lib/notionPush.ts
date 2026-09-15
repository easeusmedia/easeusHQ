import { prisma } from "./prisma";
import { notionPatch, notionPost, TASK_DATABASE_ID } from "./notion";
import type { TaskStatus } from "./workflow";

// Pushing work *up* to Notion, the other direction from lib/notion.ts.
//
// The Editing Queue's own columns, and what we put in each:
//
//   Video / Subject   the task title
//   Status            our stage, in Notion's own wording
//   Editor            the assignee's Notion account, when they have one
//   Editor Queu Date  the due date, or the day it was created
//   Raw Links         raw footage
//   Reference         reference link
//   Assets            assets link
//   Exported Link     the Frame.io link while under review, the Drive link
//                     once delivered — the same single column Notion uses for
//                     both (see routeExportedLink in tasks/actions.ts)
//   Sync check        who it's assigned to, in text. A fallback, not a
//                     duplicate: most of the team has no Notion account, so
//                     without this the Editor column would simply be blank
//                     and the row wouldn't say whose work it is.

// Our stage -> the exact option names on the Notion Status property,
// verified against the live database rather than assumed.
const NOTION_STATUS: Record<TaskStatus, string> = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  revision_requested: "Revision requested",
  sent_for_client_approval: "Sent for Client Approval",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};

// Whose work gets mirrored: Operations, minus the admin. Core members and
// editors alike — Jyotsna, Arpit, Abhishek and the editors — but not Ashmit
// (he runs the place rather than working the queue) and not Sales, whose
// work has no business in a database called Editing Queue.
//
// Derived from team and role rather than a list of names, so someone joining
// Operations is covered without anyone remembering to add them here.
export function pushesToNotion(user: {
  role: string;
  teamSlug: string | null;
}): boolean {
  return user.teamSlug === "operations" && user.role !== "admin";
}

type PushableTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  rawLink: string | null;
  referenceLink: string | null;
  assetLink: string | null;
  frameioLink: string | null;
  driveLink: string | null;
  assignedTo: { name: string; notionUserId: string | null } | null;
};

// A url property rejects an empty string, so anything blank is sent as null.
const url = (v: string | null) => ({ url: v && v.trim() ? v : null });

function propertiesFor(task: PushableTask) {
  // Whichever link is current for the stage — Notion keeps both in one
  // column, so sending the Drive link once it exists and the Frame.io link
  // before that matches how the team already uses it.
  const exported = task.driveLink ?? task.frameioLink;
  const date = task.dueDate ?? task.createdAt;

  return {
    "Video / Subject": { title: [{ text: { content: task.title.slice(0, 2000) } }] },
    Status: { status: { name: NOTION_STATUS[task.status] } },
    "Editor Queu Date": { date: { start: date.toISOString().slice(0, 10) } },
    "Raw Links": url(task.rawLink),
    "Reference ": url(task.referenceLink),
    Assets: url(task.assetLink),
    "Exported Link": url(exported),
    "Sync check": {
      rich_text: task.assignedTo ? [{ text: { content: task.assignedTo.name } }] : [],
    },
    ...(task.assignedTo?.notionUserId
      ? { Editor: { people: [{ object: "user", id: task.assignedTo.notionUserId }] } }
      : {}),
  };
}

// Creates the row and records its id, so later syncs update this page rather
// than making a second one. notionCreatedByApp marks us as the owner of the
// row for conflict purposes.
export async function createInNotion(taskId: string): Promise<{ pageId?: string; error?: string }> {
  const task = await loadTask(taskId);
  if (!task) return { error: "That task doesn't exist." };
  if (task.notionPageId) return { pageId: task.notionPageId }; // already mirrored

  try {
    const page = await notionPost("/pages", {
      parent: { database_id: TASK_DATABASE_ID },
      properties: propertiesFor(task),
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { notionPageId: page.id, notionCreatedByApp: true },
    });
    return { pageId: page.id };
  } catch (err) {
    // Never let Notion being down stop someone creating a task here. The row
    // is queued for the next sync instead (notionPageId stays null, so the
    // sync picks it up as unmirrored).
    return { error: err instanceof Error ? err.message : "Couldn't reach Notion." };
  }
}

// Pushes the current status and links onto a page this app owns.
export async function updateInNotion(taskId: string): Promise<{ error?: string }> {
  const task = await loadTask(taskId);
  if (!task?.notionPageId) return { error: "Not mirrored in Notion." };
  try {
    await notionPatch(`/pages/${task.notionPageId}`, { properties: propertiesFor(task) });
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach Notion." };
  }
}

async function loadTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { assignedTo: { select: { name: true, notionUserId: true } } },
  });
}
