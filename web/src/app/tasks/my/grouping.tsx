import Link from "next/link";
import type { TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE, type WorkGroup } from "@/lib/workTaskStages";
import { AssigneeLabel, Avatar, StageColumn } from "../TaskCard";
import type { WorkTaskCardData } from "./WorkTaskCard";

// The pieces the Work board needs to show editors' editing-queue tasks next
// to the team's own work tasks, and to lay both out in groups (the grouping
// itself is groupTasks, in workTaskStages).

type Person = { id: string; name: string; team?: { slug: string; name: string } | null };

// An editing-queue task, read-only here — its stage moves on the editing
// board, where the approval rules live, so the card links there.
export type QueueCardData = {
  id: string;
  title: string;
  status: TaskStatus;
  client: string;
  project: string;
  assignedTo: Person | null;
};

export type Group = WorkGroup<WorkTaskCardData, QueueCardData>;

export function GroupHeader({ group, count, className = "" }: { group: Group; count: number; className?: string }) {
  const stage = group.status && WORK_TASK_STAGE[group.status];
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
        stage ? `status-pop ${stage.pill}` : "border-border bg-surface"
      } ${className}`}
    >
      {stage && <span className={`h-2 w-2 rounded-full ${stage.dot}`} />}
      {group.person && <Avatar name={group.person} size={20} />}
      <span className="truncate whitespace-nowrap">{group.label}</span>
      <span className="ml-auto rounded-full bg-black/20 px-2 text-xs">{count}</span>
    </div>
  );
}

function QueuePill({ status }: { status: TaskStatus }) {
  return (
    <span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE[status].pill}`}>
      {STAGE[status].label}
    </span>
  );
}

export function QueueCard({ task, showAssignee }: { task: QueueCardData; showAssignee: boolean }) {
  return (
    <Link href="/tasks" className="card-surface card-interactive flex w-full flex-col gap-2.5 rounded-xl p-4 text-left shadow-sm">
      <QueuePill status={task.status} />
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <p className="truncate text-xs text-muted">
        {task.client} · {task.project}
      </p>
      {showAssignee && task.assignedTo && (
        <span className="mt-1 flex min-w-0 items-center gap-1.5 border-t border-border pt-2.5 text-xs">
          <Avatar name={task.assignedTo.name} size={20} />
          <span className="truncate text-foreground">{task.assignedTo.name}</span>
        </span>
      )}
    </Link>
  );
}

export function QueueRow({ task, showAssignee }: { task: QueueCardData; showAssignee: boolean }) {
  return (
    <Link href="/tasks" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
      <span className="hidden shrink-0 truncate text-xs text-muted sm:inline">
        {task.client} · {task.project}
      </span>
      {showAssignee && task.assignedTo && <AssigneeLabel name={task.assignedTo.name} />}
      <StageColumn>
        <QueuePill status={task.status} />
      </StageColumn>
    </Link>
  );
}
