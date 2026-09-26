import { prisma } from "./prisma";
import { notionGet, notionPatch, notionPost, taskDatabaseId } from "./notion";
import { NOTION_STATUS, WORK_TASK_NOTION_STATUS, exportedLinkFor } from "./notionMapping";
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
      parent: { database_id: await taskDatabaseId() },
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

// Pushes the current title, status, dates and links onto the task's row.
//
// A row deleted in Notion sits in its trash, and Notion refuses to update a
// trashed page — which used to leave the task silently un-pushed and missing
// from the queue. So a trashed row is restored and written in one call, and
// a row that's gone for good is replaced by a fresh one.
export async function updateInNotion(taskId: string): Promise<{ error?: string; restored?: boolean; recreated?: boolean }> {
  const task = await loadTask(taskId);
  if (!task?.notionPageId) return { error: "Not mirrored in Notion." };
  const properties = propertiesFor(task);
  try {
    await notionPatch(`/pages/${task.notionPageId}`, { properties });
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't reach Notion.";
    if (/archiv|trash/i.test(message)) {
      try {
        await notionPatch(`/pages/${task.notionPageId}`, { archived: false, in_trash: false, properties });
        return { restored: true };
      } catch (retry) {
        return { error: retry instanceof Error ? retry.message : message };
      }
    }
    // the page itself is gone — forget it and make a new one
    if (/could not find|not found|invalid.*id/i.test(message)) {
      await prisma.task.update({ where: { id: taskId }, data: { notionPageId: null, notionCreatedByApp: false } });
      const res = await createInNotion(taskId);
      return res.error ? { error: res.error } : { recreated: true };
    }
    return { error: message };
  }
}

// ---- work tasks ----
//
// Two destinations, because the team's Notion is already arranged that way:
//
//   Core members (Abhishek, Jyotsna, Arpit) each have their own workbook —
//   a plain to-do list: a task name, a done checkbox, a start date. Their
//   work tasks go there.
//
//   Editors have no workbook of their own; theirs are filtered *views* of
//   the shared Editing Queue, so their work belongs in the queue and shows
//   up in their workbook automatically.
//
// The workbooks don't agree on property names — Arpit's checkbox is called
// "Checkbox" where the others say "Status" — so properties are matched by
// type rather than by name. That also covers whoever's workbook is added
// next without needing to know what they called their columns.
type WorkbookSchema = {
  title: string;
  checkbox: string | null;
  startDate: string | null;
  endDate: string | null;
};

// One fetch per database per process rather than per task — a sync pushes
// many tasks to the same handful of workbooks.
const schemaCache = new Map<string, WorkbookSchema>();

async function workbookSchema(databaseId: string): Promise<WorkbookSchema> {
  const cached = schemaCache.get(databaseId);
  if (cached) return cached;

  const db = await notionGet(`/databases/${databaseId}`);
  const props = Object.entries(db.properties ?? {}) as [string, { type: string }][];
  const byType = (type: string) => props.filter(([, p]) => p.type === type).map(([n]) => n);
  const dates = byType("date");

  const schema: WorkbookSchema = {
    title: byType("title")[0] ?? "Name",
    checkbox: byType("checkbox")[0] ?? null,
    // by name where they follow the convention, else just the first/second
    // date column in order
    startDate: dates.find((n) => /start/i.test(n)) ?? dates[0] ?? null,
    endDate: dates.find((n) => /end|due/i.test(n)) ?? null,
  };
  schemaCache.set(databaseId, schema);
  return schema;
}

export async function pushWorkTaskToNotion(workTaskId: string): Promise<{ error?: string }> {
  const t = await prisma.workTask.findUnique({
    where: { id: workTaskId },
    include: {
      tags: true,
      assignedTo: { select: { name: true, notionUserId: true, notionWorkbookDbId: true } },
    },
  });
  if (!t) return { error: "That task doesn't exist." };

  try {
    const workbook = t.assignedTo.notionWorkbookDbId;
    const properties = workbook
      ? await workbookProperties(workbook, t)
      : editingQueueProperties(t);
    const databaseId = workbook ?? (await taskDatabaseId());

    if (t.notionPageId) {
      await notionPatch(`/pages/${t.notionPageId}`, { properties });
    } else {
      const page = await notionPost("/pages", { parent: { database_id: databaseId }, properties });
      await prisma.workTask.update({ where: { id: workTaskId }, data: { notionPageId: page.id } });
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach Notion." };
  }
}

type WorkTaskRow = {
  title: string;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  links: unknown;
  assignedTo: { name: string; notionUserId: string | null };
};

async function workbookProperties(databaseId: string, t: WorkTaskRow) {
  const s = await workbookSchema(databaseId);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    [s.title]: { title: [{ text: { content: t.title.slice(0, 2000) } }] },
    ...(s.checkbox ? { [s.checkbox]: { checkbox: t.status === "done" } } : {}),
    ...(s.startDate ? { [s.startDate]: { date: { start: day(t.createdAt) } } } : {}),
    ...(s.endDate && t.dueDate ? { [s.endDate]: { date: { start: day(t.dueDate) } } } : {}),
  };
}

// An editor's work task, in the shared queue's own shape.
function editingQueueProperties(t: WorkTaskRow) {
  const links = (t.links as { label: string; url: string }[] | null) ?? [];
  return {
    "Video / Subject": { title: [{ text: { content: t.title.slice(0, 2000) } }] },
    Status: { status: { name: WORK_TASK_NOTION_STATUS[t.status] ?? "Queued" } },
    "Editor Queu Date": { date: { start: t.createdAt.toISOString().slice(0, 10) } },
    "Raw Links": url(links[0]?.url ?? null),
    "Sync check": { rich_text: [{ text: { content: t.assignedTo.name } }] },
    ...(t.assignedTo.notionUserId
      ? { Editor: { people: [{ object: "user", id: t.assignedTo.notionUserId }] } }
      : {}),
  };
}

async function loadTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { assignedTo: { select: { name: true, notionUserId: true } } },
  });
}
