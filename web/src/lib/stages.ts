import type { TaskStatus } from "./workflow";

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
