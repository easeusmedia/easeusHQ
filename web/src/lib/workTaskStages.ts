import type { WorkTaskStatus } from "@prisma/client";
import type { TaskStatus } from "./workflow";

// How every Work Task column is labelled and ordered — the personal/team
// task board's equivalent of stages.ts, deliberately much shorter than the
// client editing-queue pipeline (see the WorkTaskStatus comment in
// schema.prisma for why these are two separate systems).
//
// The labels are deliberately unlike the editing queue's (Queued, Editing,
// Sent for approval…): both kinds of task now sit on the same Organization
// view, and a personal task reading "In review" next to an edit reading
// "Sent for approval" invited exactly the mix-up this avoids.
export const WORK_TASK_STAGE: Record<WorkTaskStatus, { label: string; dot: string; pill: string }> = {
  todo: {
    label: "Up next",
    dot: "bg-neutral-400",
    pill: "bg-surface text-muted border-border",
  },
  in_progress: {
    label: "Underway",
    dot: "bg-blue-400",
    pill: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  },
  in_review: {
    label: "Awaiting review",
    dot: "bg-purple-400",
    pill: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  },
  done: {
    label: "Completed",
    dot: "bg-green-400",
    pill: "bg-green-400/15 text-green-300 border-green-400/30",
  },
};

export const WORK_TASK_STATUSES: WorkTaskStatus[] = ["todo", "in_progress", "in_review", "done"];

// Where an editing-queue task lands on the Work board's four columns, so
// editors' work shows up next to everyone else's. Final export ready counts
// as done — that's what it means in Notion too (see NOTION_STATUS_MAP).
export const QUEUE_COLUMN: Record<TaskStatus, WorkTaskStatus> = {
  queued: "todo",
  editing: "in_progress",
  revision_requested: "in_progress",
  sent_for_approval: "in_review",
  sent_for_client_approval: "in_review",
  final_export_ready: "done",
  delivered_and_uploaded: "done",
};

// The Organization view shows two kinds of task side by side — the team's
// own work tasks and editors' editing-queue tasks — laid out by the person
// doing the work, by their role (job title: Video editor, Project manager…)
// or by their team. A personal board is laid out by status.
export type GroupBy = "status" | "person" | "role" | "team";

type Person = { id: string; name: string; team?: { slug: string; name: string } | null; role?: string | null };
type WorkItem = { status: WorkTaskStatus; sortOrder: number; assignedTo: Person };
type QueueItem = { status: TaskStatus; assignedTo: Person | null };

export type WorkGroup<W, Q> = {
  key: string;
  label: string;
  status?: WorkTaskStatus;
  person?: string;
  work: W[];
  queue: Q[];
};

export function groupTasks<W extends WorkItem, Q extends QueueItem>(
  by: GroupBy,
  work: W[],
  queue: Q[],
  // the order teams (by slug) or roles (by name) are listed in
  order: string[]
): WorkGroup<W, Q>[] {
  if (by === "status") {
    return WORK_TASK_STATUSES.map((s) => ({
      key: s,
      label: WORK_TASK_STAGE[s].label,
      status: s,
      work: work.filter((t) => t.status === s),
      queue: queue.filter((q) => QUEUE_COLUMN[q.status] === s),
    }));
  }

  const groups = new Map<string, WorkGroup<W, Q>>();
  const bucket = (p: Person | null) => {
    const key = (by === "person" ? p?.id : by === "role" ? p?.role : p?.team?.slug) ?? "";
    let g = groups.get(key);
    if (!g) {
      const label =
        by === "person" ? (p?.name ?? "Unassigned") : by === "role" ? (p?.role ?? "No role") : (p?.team?.name ?? "No team");
      g = { key, label, person: by === "person" ? p?.name : undefined, work: [], queue: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const t of work) bucket(t.assignedTo).work.push(t);
  for (const q of queue) bucket(q.assignedTo).queue.push(q);

  // people A–Z, teams and roles in their own order; the catch-all goes last
  const rank = (g: WorkGroup<W, Q>) => (g.key === "" ? order.length + 1 : by === "person" ? 0 : order.indexOf(g.key));
  const byStage = (a: W, b: W) =>
    WORK_TASK_STATUSES.indexOf(a.status) - WORK_TASK_STATUSES.indexOf(b.status) || a.sortOrder - b.sortOrder;
  return [...groups.values()]
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
    .map((g) => ({ ...g, work: g.work.sort(byStage) }));
}
