import type { TaskStatus } from "./workflow";

// How every task stage is labelled and coloured, in one plain module so
// both client and server components can read it. It used to live in
// TaskCard.tsx, which is "use client" — importing plain data from a client
// module into a server component silently yields undefined, which is
// exactly the bug that produced blank status pills once already.
// `link` is the one link worth surfacing on the card at that stage — raw
// footage while it's being worked on, the Frame.io cut while it's under
// review (ours, then the client's), the final Drive folder once it ships.
// Seven stages, seven hues far enough apart to tell at a glance (final
// export used to be green right beside delivered's emerald). Pills are a
// soft fill with no outline — the colour is the signal, the ring was noise.
// Required, not optional: a new stage that forgets it silently drops the
// link off every card in that column, which is exactly what happened when
// sent_for_client_approval was added.
export const STAGE: Record<
  TaskStatus,
  { label: string; dot: string; pill: string; link: { field: "rawLink" | "frameioLink" | "driveLink"; label: string } }
> = {
  queued: {
    label: "Queued",
    dot: "bg-zinc-400",
    pill: "bg-zinc-400/15 text-zinc-300 border-transparent",
    link: { field: "rawLink", label: "Raw footage" },
  },
  editing: {
    label: "Editing",
    dot: "bg-blue-400",
    pill: "bg-blue-400/15 text-blue-300 border-transparent",
    link: { field: "rawLink", label: "Raw footage" },
  },
  sent_for_approval: {
    label: "Sent for approval",
    dot: "bg-violet-400",
    pill: "bg-violet-400/15 text-violet-300 border-transparent",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  sent_for_client_approval: {
    label: "Sent for client approval",
    dot: "bg-cyan-400",
    pill: "bg-cyan-400/15 text-cyan-300 border-transparent",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  revision_requested: {
    label: "Revision requested",
    dot: "bg-orange-400",
    pill: "bg-orange-400/15 text-orange-300 border-transparent",
    link: { field: "frameioLink", label: "Frame.io" },
  },
  final_export_ready: {
    label: "Final export ready",
    dot: "bg-lime-400",
    pill: "bg-lime-400/15 text-lime-300 border-transparent",
    link: { field: "driveLink", label: "Drive" },
  },
  delivered_and_uploaded: {
    label: "Delivered and uploaded",
    dot: "bg-emerald-400",
    pill: "bg-emerald-400/15 text-emerald-300 border-transparent",
    link: { field: "driveLink", label: "Drive" },
  },
};

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
