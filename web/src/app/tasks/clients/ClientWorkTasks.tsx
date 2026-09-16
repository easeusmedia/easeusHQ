import Link from "next/link";
import type { WorkTaskStatus } from "@prisma/client";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { Avatar } from "../TaskCard";
import { TaskTagChip } from "../TaskTagPicker";

export type ClientWorkTask = {
  id: string;
  title: string;
  status: WorkTaskStatus;
  projectName: string | null;
  assignee: { name: string } | null;
  tags: string[];
};

// One work task, shaped to sit in the same list as the editing-queue rows on
// a client's page (see ClientOngoing). Same height, same columns, its own
// four stages — a thumbnail or an audio pass reads as part of the client's
// work rather than as a footnote under it.
export function WorkTaskRow({ task }: { task: ClientWorkTask }) {
  return (
    <Link
      href="/tasks/my"
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-left hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{task.title}</span>
        {task.projectName && <span className="block truncate text-xs text-muted">{task.projectName}</span>}
      </span>

      {task.tags.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {task.tags.map((tag) => (
            <TaskTagChip key={tag} name={tag} />
          ))}
        </span>
      )}

      {task.assignee && <Avatar name={task.assignee.name} size={22} />}
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${WORK_TASK_STAGE[task.status].pill}`}>
        {WORK_TASK_STAGE[task.status].label}
      </span>
    </Link>
  );
}
