import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getDate, getTitleText, notionGet, notionPatch, notionPost, taskDatabaseId, type NotionRow } from "./notion";
import { deleteForGood } from "./taskTrack";
import { NOTION_STATUS, WORK_TASK_NOTION_STATUS, clearsEditor, editorPeople, exportedLinkFor, notionWins, sameNotionId, workTaskHome } from "./notionMapping";
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
  };
}

// The Editor column to write onto a row (see clearsEditor): the assignee's
// Notion account when we know it; otherwise cleared only when it names one
// of our own people, and otherwise left exactly as it is.
async function editorFor(pageId: string | null, notionUserId: string | null) {
  if (notionUserId) return { Editor: editorPeople(notionUserId) };
  if (!pageId) return {};
  const page = await notionGet(`/pages/${pageId}`).catch(() => null);
  const current = ((page?.properties?.Editor?.people ?? []) as { id: string }[]).map((u) => u.id);
  if (current.length === 0) return {};
  const known = new Set(
    (await prisma.user.findMany({ where: { notionUserId: { not: null } }, select: { notionUserId: true } })).map((u) => u.notionUserId!)
  );
  return clearsEditor(current, known) ? { Editor: editorPeople(null) } : {};
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
      properties: { ...propertiesFor(task), ...(await editorFor(null, task.assignedTo?.notionUserId ?? null)) },
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
  if (!task?.notionPageId) return { error: "This task isn't linked to Notion." };
  const properties = { ...propertiesFor(task), ...(await editorFor(task.notionPageId, task.assignedTo?.notionUserId ?? null)) };
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

// Puts a work task in its assignee's Notion (see workTaskHome), and only
// theirs. A task handed to someone else is taken out of the last person's
// Notion (its page archived, which Notion keeps in its trash) and made fresh
// in the new person's; a task handed to someone with no place in Notion is
// taken out and left out.
export async function pushWorkTaskToNotion(workTaskId: string): Promise<{ error?: string }> {
  const t = await prisma.workTask.findUnique({
    where: { id: workTaskId },
    include: {
      tags: true,
      assignedTo: {
        select: { name: true, role: true, notionUserId: true, notionWorkbookDbId: true, team: { select: { slug: true } } },
      },
    },
  });
  if (!t) return { error: "That task doesn't exist." };

  try {
    const home = workTaskHome({ role: t.assignedTo.role, teamSlug: t.assignedTo.team?.slug ?? null, workbookId: t.assignedTo.notionWorkbookDbId });
    const databaseId = home === "workbook" ? t.assignedTo.notionWorkbookDbId! : home === "queue" ? await taskDatabaseId() : null;

    let pageId = t.notionPageId;
    if (pageId) {
      // where its page is now (asked of Notion once, for pages made before
      // this was recorded)
      const current = t.notionDatabaseId ?? (await notionGet(`/pages/${pageId}`).catch(() => null))?.parent?.database_id ?? null;
      if (!databaseId || !sameNotionId(current, databaseId)) {
        await notionPatch(`/pages/${pageId}`, { archived: true }).catch(() => {});
        await prisma.workTask.update({ where: { id: workTaskId }, data: { notionPageId: null, notionDatabaseId: null } });
        pageId = null;
      }
    }
    if (!databaseId) return {};

    // matched now: Push skips it until it changes here again
    const now = new Date();
    const synced = { notionSyncedAt: now, updatedAt: now };
    const properties =
      home === "workbook"
        ? await workbookProperties(databaseId, t)
        : { ...editingQueueProperties(t), ...(await editorFor(pageId, t.assignedTo.notionUserId)) };
    if (pageId) {
      try {
        await notionPatch(`/pages/${pageId}`, { properties });
        await prisma.workTask.update({ where: { id: workTaskId }, data: { notionDatabaseId: databaseId, ...synced } });
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        // someone deleted the row in their Notion: their call, so it stays deleted
        if (/archiv|trash/i.test(message)) return {};
        // gone for good (not even in the trash): make it again below
        if (!/could not find|not found/i.test(message)) throw err;
      }
    }
    const page = await notionPost("/pages", { parent: { database_id: databaseId }, properties });
    await prisma.workTask.update({ where: { id: workTaskId }, data: { notionPageId: page.id, notionDatabaseId: databaseId, ...synced } });
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach Notion." };
  }
}

// A person's Notion workbook, brought down into their to-dos, the same
// columns as on the way up: the title, the tick (done), Start Date (when it
// was made) and End Date (its due date). A row new there becomes a to-do; a
// row edited there takes over its to-do, unless the to-do has changed here
// since (Push sends that up first); a row deleted there goes here too.
// Only open rows and rows edited in the past month come down: a workbook
// holds years of finished work (about 4,000 rows across three in Oct 2026),
// which would only weigh on every page that lists to-dos.
export async function pullWorkbook(userId: string): Promise<{ added: number; updated: number; removed: number }> {
  const none = { added: 0, updated: 0, removed: 0 };
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { notionWorkbookDbId: true, teamId: true } });
  const databaseId = person?.notionWorkbookDbId;
  if (!databaseId) return none;

  const s = await workbookSchema(databaseId);
  const recent = { timestamp: "last_edited_time", last_edited_time: { past_month: {} } };
  const filter = s.checkbox ? { or: [{ property: s.checkbox, checkbox: { equals: false } }, recent] } : recent;
  const rows: NotionRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await notionPost(`/databases/${databaseId}/query`, { page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const key = (id: string) => id.replace(/-/g, "");
  const tasks = await prisma.workTask.findMany({
    where: { assignedToId: userId, notionPageId: { not: null } },
    select: { id: true, title: true, status: true, dueDate: true, completedAt: true, updatedAt: true, notionSyncedAt: true, notionPageId: true, notionDatabaseId: true },
  });
  const byPage = new Map(tasks.map((t) => [key(t.notionPageId!), t]));
  const now = new Date();
  const synced = { notionSyncedAt: now, updatedAt: now };
  const fresh: Prisma.WorkTaskCreateManyInput[] = [];
  let updated = 0;

  for (const row of rows) {
    const title = getTitleText(row.properties)?.slice(0, 500);
    if (!title) continue;
    const done = !!s.checkbox && row.properties[s.checkbox]?.checkbox === true;
    const start = s.startDate ? getDate(row.properties, s.startDate) : null;
    const due = s.endDate ? getDate(row.properties, s.endDate) : null;
    const finished = due ?? start ?? new Date(row.last_edited_time ?? now);
    const t = byPage.get(key(row.id));
    if (!t) {
      fresh.push({
        title,
        status: done ? "done" : "todo",
        dueDate: due,
        createdAt: start ?? new Date((row as { created_time?: string }).created_time ?? now),
        completedAt: done ? finished : null,
        assignedToId: userId,
        createdById: userId,
        teamId: person.teamId,
        notionPageId: row.id,
        notionDatabaseId: databaseId,
        sortOrder: now.getTime(),
        ...synced,
      });
      continue;
    }
    // whichever side was edited last wins (lib/notionMapping); a newer edit
    // here stays, and Push sends it
    if (!notionWins(t, row.last_edited_time)) continue;
    const data: Prisma.WorkTaskUpdateInput = {};
    if (t.title !== title) data.title = title;
    if (done && t.status !== "done") Object.assign(data, { status: "done", completedAt: t.completedAt ?? finished });
    if (!done && t.status === "done") Object.assign(data, { status: "todo", completedAt: null });
    if (s.endDate && (t.dueDate?.getTime() ?? null) !== (due?.getTime() ?? null)) data.dueDate = due;
    if (!Object.keys(data).length) continue;
    await prisma.workTask.update({ where: { id: t.id }, data: { ...data, ...synced } });
    updated++;
  }

  // in this workbook here and missing from what came down: either deleted
  // there (so it goes here too) or finished long enough ago to be left out,
  // which only Notion can say, page by page (a few at most)
  const there = new Set(rows.map((r) => key(r.id)));
  const monthAgo = now.getTime() - 30 * 86_400_000;
  let removed = 0;
  for (const t of tasks) {
    if (!sameNotionId(t.notionDatabaseId, databaseId) || there.has(key(t.notionPageId!))) continue;
    if (t.status === "done" && (t.completedAt ?? t.updatedAt).getTime() < monthAgo) continue;
    const page = await notionGet(`/pages/${t.notionPageId}`).catch((err: Error) => {
      if (/could not find|not found/i.test(err.message)) return null;
      throw err;
    });
    if (page && !page.archived && !page.in_trash) continue;
    await deleteForGood({ kind: "work", id: t.id });
    removed++;
  }

  if (fresh.length) await prisma.workTask.createMany({ data: fresh });
  return { added: fresh.length, updated, removed };
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
  };
}

async function loadTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { assignedTo: { select: { name: true, notionUserId: true } } },
  });
}
