import { prisma } from "./prisma";
import { notionPatch, notionPost, TASK_DATABASE_ID } from "./notion";
import { NOTION_STATUS, exportedLinkFor } from "./notionMapping";
import type { TaskStatus } from "./workflow";

// Pushing work *up* to Notion, the other direction from lib/notion.ts.
// The column-by-column mapping lives in notionMapping.ts, which has no
// database or network imports so it can be tested on its own.
export { pushesToNotion, exportedLinkFor } from "./notionMapping";

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
  const exported = exportedLinkFor(task);
  const date = task.createdAt;

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
