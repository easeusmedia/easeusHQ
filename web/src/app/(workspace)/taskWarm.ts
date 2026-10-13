import { getTaskActivity } from "./actions";
import { getTaskRecord } from "./taskRecord";
import type { TaskRef } from "@/lib/taskTrack";

// A task's window shows its record (who made it, its department, who's on
// it) and its history, both from the server. They're fetched the moment the
// pointer is on the task, the way PrefetchLink loads a page, and kept for a
// minute, so the window opens with them already in place rather than filling
// in a moment after it appears.
type Record = Awaited<ReturnType<typeof getTaskRecord>>;
type Logs = Awaited<ReturnType<typeof getTaskActivity>>;
const FRESH = 60_000;
const records = new Map<string, { at: number; value?: Record }>();
const histories = new Map<string, { at: number; value?: Logs }>();
const keyOf = (ref: TaskRef) => `${ref.kind}:${ref.id}`;

// fetched now, and kept for the next time the window opens
export function loadRecord(ref: TaskRef): Promise<Record> {
  const entry: { at: number; value?: Record } = { at: Date.now(), value: records.get(keyOf(ref))?.value };
  records.set(keyOf(ref), entry);
  return getTaskRecord(ref).then((value) => (entry.value = value));
}
export function loadHistory(taskId: string): Promise<Logs> {
  const entry: { at: number; value?: Logs } = { at: Date.now(), value: histories.get(taskId)?.value };
  histories.set(taskId, entry);
  return getTaskActivity(taskId).then((value) => (entry.value = value));
}

export const keptRecord = (ref: TaskRef) => records.get(keyOf(ref))?.value ?? null;
export const keptHistory = (taskId: string) => histories.get(taskId)?.value ?? null;

// the pointer is on a task: load what its window shows, unless it's fresh
export function warmTask(ref: TaskRef) {
  const now = Date.now();
  if ((records.get(keyOf(ref))?.at ?? 0) < now - FRESH) loadRecord(ref).catch(() => records.delete(keyOf(ref)));
  if (ref.kind === "task" && (histories.get(ref.id)?.at ?? 0) < now - FRESH) loadHistory(ref.id).catch(() => histories.delete(ref.id));
}
