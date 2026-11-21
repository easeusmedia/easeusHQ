import { prisma } from "./prisma";
import { getRealUserId } from "./auth";
import { deleteForGood, type TaskRef } from "./taskTrack";
import { stageChangeAction, stageLabel } from "./stages";
import { WORK_TASK_STAGE } from "./workTaskStages";
import type { TaskStatus } from "./workflow";

// Undo and redo on tasks (Abhishek, 21 Nov 2026: "so that we can have
// anything restored, at least one time"): each person's last change to a
// task (a tick, a stage move, an edit, a new date, a delete), one step back
// and one forward. Kept as the rows before and after, the task's own and
// what hangs off it, under AppSetting "undo:<userId>", one step per person,
// so nothing piles up. Undo is refused once someone else has changed the
// task since.

type Row = Record<string, unknown>;
type Snap = { row: Row | null; kids: Record<string, Row[]> };
type Item = { ref: TaskRef; before: Snap; after: Snap };
type Step = { items: Item[]; label: string; undone: boolean; at: string };
export type UndoStep = { label: string; undone: boolean; at: string };

const TABLE = { task: "Task", work: "WorkTask" } as const;
// what hangs off a task, by the column that points at it
const KIDS: Record<TaskRef["kind"], [string, string][]> = {
  task: [["Feedback", "taskId"], ["TaskShare", "taskId"], ["TaskDateChange", "taskId"], ["Notice", "taskId"], ["_TaskToTaskTag", "A"], ["ProjectAsset", "taskId"], ["PerformanceEntry", "taskId"]],
  work: [["TaskShare", "workTaskId"], ["TaskDateChange", "workTaskId"], ["Notice", "workTaskId"], ["_TaskTagToWorkTask", "B"]],
};
// rows that outlive the task (only unlinked when it goes): put back as they were, never removed
const KEPT = new Set(["ProjectAsset", "PerformanceEntry"]);
const q = (name: string) => `"${name}"`;
const keyOf = (userId: string) => `undo:${userId}`;

async function snap(ref: TaskRef): Promise<Snap> {
  const [r] = await prisma.$queryRawUnsafe<{ row: Row | null }[]>(`select to_jsonb(t) as row from ${q(TABLE[ref.kind])} t where id = $1`, ref.id);
  const kids: Record<string, Row[]> = {};
  for (const [table, col] of KIDS[ref.kind]) {
    const [k] = await prisma.$queryRawUnsafe<{ rows: Row[] }[]>(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${q(table)} x where ${q(col)} = $1`, ref.id);
    if (k.rows.length) kids[table] = k.rows;
  }
  return { row: r?.row ?? null, kids };
}

// the same task, but for when it was last saved and where it sits in its column
export function sameRow(a: Row | null, b: Row | null): boolean {
  const strip = (r: Row | null) => (r ? JSON.stringify({ ...r, updatedAt: null, sortOrder: null }) : null);
  return strip(a) === strip(b);
}

function stageName(ref: TaskRef, row: Row): string {
  const status = String(row.status);
  return ref.kind === "task" ? stageLabel(status as TaskStatus, row.workflow as string) : (WORK_TASK_STAGE[status as keyof typeof WORK_TASK_STAGE]?.label ?? status);
}

// what the step did, in a few words
export function stepLabel(items: { ref: TaskRef; before: { row: Row | null }; after: { row: Row | null } }[]): string {
  if (items.length > 1) return items.every((i) => !i.after.row) ? `Deleted ${items.length} tasks` : `Changed ${items.length} tasks`;
  const { ref, before, after } = items[0];
  const title = `"${String((after.row ?? before.row)?.title ?? "Task")}"`;
  if (!after.row) return `Deleted ${title}`;
  if (!before.row) return `Added ${title}`;
  if (before.row.status !== after.row.status) return `Moved ${title} to ${stageName(ref, after.row)}`;
  if (before.row.dueDate !== after.row.dueDate) return `Changed the date on ${title}`;
  return `Edited ${title}`;
}

// Runs a change to these tasks and keeps it as the person's step to undo.
// A change that changed nothing (refused, or the same value) keeps no step.
export async function withUndo<R>(refs: TaskRef[], run: () => Promise<R>): Promise<R> {
  const userId = await getRealUserId();
  return userId ? recordUndo(userId, refs, run) : run();
}
export async function recordUndo<R>(userId: string, refs: TaskRef[], run: () => Promise<R>): Promise<R> {
  if (!refs.length) return run();
  const before = await Promise.all(refs.map(snap));
  const result = await run();
  const after = await Promise.all(refs.map(snap));
  const items = refs.map((ref, i) => ({ ref, before: before[i], after: after[i] })).filter((i) => !sameRow(i.before.row, i.after.row));
  if (items.length) await keep(userId, { items, label: stepLabel(items), undone: false, at: new Date().toISOString() });
  return result;
}

async function keep(userId: string, step: Step) {
  const value = JSON.stringify(step);
  await prisma.appSetting.upsert({ where: { key: keyOf(userId) }, create: { key: keyOf(userId), value }, update: { value } });
}

async function stepOf(userId: string): Promise<Step | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: keyOf(userId) } });
  try {
    return s ? (JSON.parse(s.value) as Step) : null;
  } catch {
    return null;
  }
}

// what the frame shows: the step, without its rows
export async function undoStepFor(userId: string): Promise<UndoStep | null> {
  const s = await stepOf(userId);
  return s ? { label: s.label, undone: s.undone, at: s.at } : null;
}

// a row written back whole, every column as it was
async function writeRow(table: string, row: Row) {
  const cols = Object.keys(row).filter((c) => c !== "id");
  await prisma.$executeRawUnsafe(
    `update ${q(table)} t set (${cols.map(q).join(", ")}) = (select ${cols.map((c) => `r.${q(c)}`).join(", ")} from jsonb_populate_record(null::${q(table)}, $1::jsonb) r) where t.id = $2`,
    JSON.stringify(row),
    row.id,
  );
}
const insertRows = (table: string, rows: Row[]) =>
  prisma.$executeRawUnsafe(`insert into ${q(table)} select * from jsonb_populate_recordset(null::${q(table)}, $1::jsonb) on conflict do nothing`, JSON.stringify(rows));

// the task back to `to`, from how it is now
async function put(ref: TaskRef, now: Row | null, to: Snap, actorId: string) {
  const table = TABLE[ref.kind];
  if (!to.row) return deleteForGood(ref);
  if (now) await writeRow(table, to.row);
  else await insertRows(table, [to.row]);
  for (const [kid, col] of KIDS[ref.kind]) {
    const rows = to.kids[kid] ?? [];
    if (KEPT.has(kid)) {
      for (const r of rows) await writeRow(kid, r);
      continue;
    }
    await prisma.$executeRawUnsafe(`delete from ${q(kid)} where ${q(col)} = $1`, ref.id);
    if (rows.length) await insertRows(kid, rows);
  }
  // a stage it moved back or on is a move in its history, as any other
  if (ref.kind === "task" && now && now.status !== to.row.status)
    await prisma.activityLog.create({ data: { actorId, action: stageChangeAction(String(now.status), String(to.row.status)), entity: "Task", entityId: ref.id } });
}

export async function undoOrRedo(userId: string, redo: boolean): Promise<{ error?: string; label?: string }> {
  const step = await stepOf(userId);
  if (!step || step.undone !== redo) return { error: redo ? "Nothing to redo." : "Nothing to undo." };
  const from = redo ? "before" : "after";
  const to = redo ? "after" : "before";
  const now = await Promise.all(step.items.map((i) => snap(i.ref)));
  const moved = step.items.findIndex((i, n) => !sameRow(now[n].row, i[from].row));
  if (moved >= 0) {
    const title = String((step.items[moved].before.row ?? step.items[moved].after.row)?.title ?? "That task");
    return { error: `"${title}" has changed since, so it can't be ${redo ? "redone" : "undone"}.` };
  }
  for (const [n, i] of step.items.entries()) await put(i.ref, now[n].row, i[to], userId);
  await keep(userId, { ...step, undone: !redo });
  return { label: step.label };
}
