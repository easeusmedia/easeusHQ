import type { WorkTaskStatus } from "@prisma/client";

// How every Work Task column is labelled and ordered — the personal/team
// task board's equivalent of stages.ts, deliberately much shorter than the
// client editing-queue pipeline (see the WorkTaskStatus comment in
// schema.prisma for why these are two separate systems).
export const WORK_TASK_STAGE: Record<WorkTaskStatus, { label: string; dot: string; pill: string }> = {
  todo: {
    label: "To do",
    dot: "bg-neutral-400",
    pill: "bg-surface text-muted border-border",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-blue-400",
    pill: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  },
  in_review: {
    label: "In review",
    dot: "bg-purple-400",
    pill: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  },
  done: {
    label: "Done",
    dot: "bg-green-400",
    pill: "bg-green-400/15 text-green-300 border-green-400/30",
  },
};

export const WORK_TASK_STATUSES: WorkTaskStatus[] = ["todo", "in_progress", "in_review", "done"];
