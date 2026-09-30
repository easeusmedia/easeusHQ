import { workflowOf, type TaskStatus } from "./workflow.ts";

// How every task stage is labelled and coloured, in one plain module so
// both client and server components can read it. It used to live in
// TaskCard.tsx, which is "use client" — importing plain data from a client
// module into a server component silently yields undefined, which is
// exactly the bug that produced blank status pills once already.
// `link` is the one link worth surfacing on the card at that stage — raw
// footage while it's being worked on, the Frame.io cut while it's under
// review (ours, then the client's), the final Drive folder once it ships.
// Required, not optional: a new stage that forgets it silently drops the
// link off every card in that column, which is exactly what happened when
// sent_for_client_approval was added.
export const STAGE: Record<
  TaskStatus,
  { label: string; dot: string; pill: string; link: { field: "rawLink" | "frameioLink" | "driveLink"; label: string } }
> = {
  queued: {
    label: "Queued",
    dot: "bg-neutral-400",
    pill: "bg-surface text-muted border-border",
    link: { field: "rawLink", label: "Raw" },
  },
  editing: {
    label: "Editing",
    dot: "bg-blue-400",
    pill: "bg-blue-400/15 text-blue-300 border-blue-400/30",
    link: { field: "rawLink", label: "Raw" },
  },
  sent_for_approval: {
    label: "Sent for approval",
    dot: "bg-purple-400",
    pill: "bg-purple-400/15 text-purple-300 border-purple-400/30",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  sent_for_client_approval: {
    label: "Sent for client approval",
    dot: "bg-cyan-400",
    pill: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  revision_requested: {
    label: "Revision requested",
    dot: "bg-orange-400",
    pill: "bg-orange-400/15 text-orange-300 border-orange-400/30",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  final_export_ready: {
    label: "Final export ready",
    dot: "bg-green-400",
    pill: "bg-green-400/15 text-green-300 border-green-400/30",
    link: { field: "driveLink", label: "Drive" },
  },
  delivered_and_uploaded: {
    label: "Delivered and uploaded",
    dot: "bg-emerald-400",
    pill: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    link: { field: "driveLink", label: "Drive" },
  },
};

// A stage's name in a task's own workflow: a design's "In progress" and
// "Final export ready", a to-do's "To do" and "Done"
const NAMES: Record<string, Partial<Record<TaskStatus, string>>> = {
  design: { editing: "In progress", delivered_and_uploaded: "Final export ready" },
  todo: { queued: "To do", delivered_and_uploaded: "Done" },
};
export function stageLabel(status: TaskStatus, workflow?: string | null): string {
  return NAMES[workflowOf(workflow)]?.[status] ?? STAGE[status].label;
}

// What each stage means, in a line: shown on hover and in the stage menu,
// so nobody has to guess what "Final export ready" asks of them
const MEANING: Record<string, Partial<Record<TaskStatus, string>>> = {
  video: {
    queued: "Assigned, and waiting for the editor to start.",
    editing: "The editor is working on it.",
    sent_for_approval: "The editor has handed in a cut, waiting for our review.",
    revision_requested: "Sent back with changes to make.",
    sent_for_client_approval: "Passed our review. The client is looking at it.",
    final_export_ready: "The client approved it. The final file is being exported.",
    delivered_and_uploaded: "Finished: the final file is uploaded for the client.",
  },
  design: {
    queued: "Assigned, and waiting for the designer to start.",
    editing: "The designer is working on it.",
    sent_for_approval: "The designer has handed it in, waiting for our review.",
    revision_requested: "Sent back with changes to make.",
    delivered_and_uploaded: "Approved and exported. Done.",
  },
  todo: { queued: "Not done yet.", delivered_and_uploaded: "Done." },
};
export function stageMeaning(status: TaskStatus, workflow?: string | null): string {
  return MEANING[workflowOf(workflow)]?.[status] ?? MEANING.video[status] ?? "";
}

// ---- the activity log's stage lines ----
//
// A stage change is stored as one string: "queued → editing". A sync writes
// the same line with "(from Notion)" on the end, because the two are not the
// same event: a person here moving a task is a decision, and a sync copying
// Notion's column is not. Which it was decides whether a later sync may
// change that task's stage again (see syncFromNotion) — so both the writing
// and the reading of that mark live here, together, rather than as four
// string tests scattered across the places that read the log.
const FROM_NOTION = " (from Notion)";

export function stageChangeAction(from: string, to: string, fromNotion = false): string {
  return `${from} → ${to}${fromNotion ? FROM_NOTION : ""}`;
}

export function parseStageChange(action: string): { from: string; to: string; fromNotion: boolean } | null {
  const fromNotion = action.endsWith(FROM_NOTION);
  const [from, to] = (fromNotion ? action.slice(0, -FROM_NOTION.length) : action).split(" → ");
  return from && to ? { from, to, fromNotion } : null;
}

// Did a person here move this task, as opposed to a sync copying Notion?
// Once they have, the board owns that task's stage.
export function movedByHand(actions: string[]): boolean {
  return actions.some((a) => parseStageChange(a)?.fromNotion === false);
}
