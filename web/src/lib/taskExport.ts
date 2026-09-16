import type { TaskStatus } from "./workflow";

// The editor work export: one spreadsheet row per task, with the timings and
// revision counts worked out from its activity log, so the file can be read
// by a person or handed straight to an AI model for analysis. Pure — no
// database — so the arithmetic is testable on its own.

export type ExportTask = {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
  revisionCount: number;
  internal: boolean;
  rawLink: string | null;
  frameioLink: string | null;
  driveLink: string | null;
  editingNotes: string | null;
  reviewNotes: string | null;
  editor: string;
  client: string;
  project: string;
  tags: string[];
};

// oldest first; `action` is "created" or "<from> → <to>", as changeStatus writes it
export type ExportEvent = { at: Date; action: string; actor: string };

type Cell = string | number;

// every stage a task can sit in; delivered is the end, so nothing accrues there
const TIMED: TaskStatus[] = [
  "queued",
  "editing",
  "sent_for_approval",
  "sent_for_client_approval",
  "revision_requested",
  "final_export_ready",
];

// sortable, spreadsheet-readable, and in the team's own time zone
const ist = (d: Date | null | undefined) =>
  d ? d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16) : "";
const hours = (from: Date, to: Date | null | undefined) =>
  to ? Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10 : "";

export function exportRow(
  t: ExportTask,
  events: ExportEvent[],
  labels: Record<TaskStatus, string>,
  now: Date
): Record<string, Cell> {
  const moves = events.flatMap((e) => {
    const [from, to] = e.action.split(" → ") as [TaskStatus, TaskStatus?];
    return to && from in labels && to in labels ? [{ ...e, from, to }] : [];
  });
  const statusChanges = moves.length;
  // Delivered now, but the log's last word is some earlier stage: the
  // delivery itself was never logged (a Notion sync, before those were
  // recorded). Close it at the task's last update, the date History shows.
  const lastMove = moves.at(-1);
  if (t.status === "delivered_and_uploaded" && lastMove && lastMove.to !== t.status && t.updatedAt > lastMove.at) {
    moves.push({ at: t.updatedAt, action: "", actor: "", from: lastMove.to, to: t.status });
  }
  const first = (to: TaskStatus) => moves.find((m) => m.to === to)?.at;
  const last = (to: TaskStatus) => moves.findLast((m) => m.to === to)?.at;
  const count = (to: TaskStatus, from?: TaskStatus) =>
    moves.filter((m) => m.to === to && (!from || m.from === from)).length;

  // Time in each stage. Each move closes the interval of the stage it left —
  // its own `from`, not our running guess, so a change the log never saw
  // (a status edited straight in Notion) can't smear time into the wrong
  // column. Whatever stage the task is in now keeps counting until today.
  const inStage = new Map<TaskStatus, number>();
  let since = t.createdAt;
  for (const m of moves) {
    inStage.set(m.from, (inStage.get(m.from) ?? 0) + (m.at.getTime() - since.getTime()));
    since = m.at;
  }
  if (t.status !== "delivered_and_uploaded") {
    inStage.set(t.status, (inStage.get(t.status) ?? 0) + (now.getTime() - since.getTime()));
  }

  const firstReview = first("sent_for_approval");
  const exportReady = last("final_export_ready");
  // only for work that's delivered now — a task reopened after delivery
  // isn't finished. One that arrived already delivered (pulled in from
  // Notion) has no move to read; History uses its last update, so do we.
  const delivered =
    t.status === "delivered_and_uploaded" ? (last("delivered_and_uploaded") ?? t.updatedAt) : undefined;

  return {
    "Task ID": t.id,
    Task: t.title,
    Client: t.client,
    Project: t.project,
    Editor: t.editor,
    Tags: t.tags.join(", "),
    "Internal (not a client deliverable)": t.internal ? "yes" : "no",
    "Current status": labels[t.status],
    Finished: t.status === "delivered_and_uploaded" ? "yes" : "no",
    "Created (IST)": ist(t.createdAt),
    "Due (IST)": ist(t.dueDate),
    "Editing started (IST)": ist(first("editing")),
    "First sent for approval (IST)": ist(firstReview),
    "Final export ready (IST)": ist(exportReady),
    "Delivered (IST)": ist(delivered),
    "Hours: created to first approval request": hours(t.createdAt, firstReview),
    "Hours: created to final export ready": hours(t.createdAt, exportReady),
    "Hours: created to delivered": hours(t.createdAt, delivered),
    "Revision rounds": t.revisionCount,
    "Revisions asked in internal review": count("revision_requested", "sent_for_approval"),
    "Revisions asked by client": count("revision_requested", "sent_for_client_approval"),
    "Times sent for approval": count("sent_for_approval"),
    "Status changes": statusChanges,
    ...Object.fromEntries(
      TIMED.map((s) => [`Hours in ${labels[s]}`, inStage.has(s) ? Math.round((inStage.get(s)! / 3_600_000) * 10) / 10 : 0])
    ),
    "Raw link": t.rawLink ?? "",
    "Frame.io link": t.frameioLink ?? "",
    "Drive link": t.driveLink ?? "",
    Brief: t.editingNotes ?? "",
    "Latest revision note": t.reviewNotes ?? "",
    // the whole trail in one cell — enough on its own for a model to
    // reconstruct what happened to the task, step by step
    Timeline: events
      .map((e) => {
        const [from, to] = e.action.split(" → ") as [TaskStatus, TaskStatus?];
        const what = to ? `${labels[from] ?? from} → ${labels[to] ?? to}` : e.action;
        return `${ist(e.at)} · ${e.actor} · ${what}`;
      })
      .join(" | "),
  };
}

// RFC 4180 CSV. The BOM makes Excel read names and the arrows as UTF-8;
// text starting with = + - @ is prefixed so a spreadsheet shows it rather
// than running it as a formula (task titles come in from Notion).
export function toCsv(rows: Record<string, Cell>[]): string {
  if (rows.length === 0) return "\uFEFF";
  const cell = (v: Cell) => {
    if (typeof v === "number") return String(v);
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = Object.keys(rows[0]);
  return "\uFEFF" + [header.map(cell), ...rows.map((r) => header.map((h) => cell(r[h])))].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
