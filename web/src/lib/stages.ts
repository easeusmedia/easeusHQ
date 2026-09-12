import type { TaskStatus } from "./workflow";

// How every task stage is labelled and coloured, in one plain module so
// both client and server components can read it. It used to live in
// TaskCard.tsx, which is "use client" — importing plain data from a client
// module into a server component silently yields undefined, which is
// exactly the bug that produced blank status pills once already.
export const STAGE: Record<TaskStatus, { label: string; dot: string; pill: string }> = {
  queued: {
    label: "Queued",
    dot: "bg-neutral-400",
    pill: "bg-surface text-muted border-border",
  },
  editing: {
    label: "Editing",
    dot: "bg-blue-400",
    pill: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  },
  sent_for_approval: {
    label: "Sent for approval",
    dot: "bg-purple-400",
    pill: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  },
  sent_for_client_approval: {
    label: "Sent for client approval",
    dot: "bg-cyan-400",
    pill: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30",
  },
  revision_requested: {
    label: "Revision requested",
    dot: "bg-orange-400",
    pill: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  },
  final_export_ready: {
    label: "Final export ready",
    dot: "bg-green-400",
    pill: "bg-green-400/15 text-green-300 border-green-400/30",
  },
  delivered_and_uploaded: {
    label: "Delivered and uploaded",
    dot: "bg-emerald-400",
    pill: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  },
};
