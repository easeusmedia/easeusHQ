import type { TaskStatus } from "./workflow";
import { istDay as istDayOf } from "./history.ts";

// What a due date means: the editor's deadline. The day the work has to
// *reach the client* — not the day the client signs it off.
//
// It used to be judged against delivery, so a cut the editor finished on
// time turned red while it sat with the client for a day or two waiting on
// their approval. The client's review time was being counted against the
// editor. Now the deadline is met the moment the task first reaches the
// client, and nothing that happens afterwards (the client asking for
// changes included) reopens it.
//
// Internal review still counts: getting past our own QC is part of reaching
// the client. Going straight to final export or delivery — internal work
// that never goes to the client at all — counts as reaching it too, or that
// work could never be anything but late.

export const REACHED_CLIENT: TaskStatus[] = ["sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

export function reachesClient(status: TaskStatus): boolean {
  return REACHED_CLIENT.includes(status);
}

// What to store when a task moves. The first arrival is recorded and then
// never moves again — a client revision sends the task back through editing,
// but the editor already met their deadline the first time.
export function handedOffStamp(current: Date | null, to: TaskStatus, now: Date = new Date()): Date | null {
  if (current) return current;
  return reachesClient(to) ? now : null;
}

export type DueState =
  | "upcoming" // still to come
  | "today" // due today, not there yet
  | "overdue" // the day has passed and it still hasn't reached the client
  | "met" // reached the client on or before the day
  | "late"; // reached the client, but after the day

const day = (d: Date | string) => istDayOf(new Date(d));

// A due date is a day in India, not a moment, so everything compares days.
export function dueState(
  dueDate: Date | string | null,
  handedOffAt: Date | string | null,
  now: Date = new Date()
): DueState | null {
  if (!dueDate) return null;
  const due = day(dueDate);
  if (handedOffAt) return day(handedOffAt) <= due ? "met" : "late";
  const today = day(now);
  if (today > due) return "overdue";
  return today === due ? "today" : "upcoming";
}

// Whole days past the due day that it reached the client — 0 when on time.
export function daysLate(dueDate: Date | string, handedOffAt: Date | string): number {
  const diff = (Date.parse(day(handedOffAt)) - Date.parse(day(dueDate))) / 86_400_000;
  return Math.max(0, Math.round(diff));
}
