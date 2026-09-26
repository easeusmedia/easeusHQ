import type { Role } from "@/lib/workflow";
import { WORK_TASK_STAGE, type WorkGroup } from "@/lib/workTaskStages";
import { Avatar, TaskCard, type TaskCardData } from "../TaskCard";
import { TaskRow } from "../TaskRow";
import type { TaskTagOption } from "../TaskTagPicker";
import type { WorkTaskCardData } from "./WorkTaskCard";

// The pieces the Work board needs to show editors' editing-queue tasks next
// to the team's own work tasks, and to lay both out in groups (the grouping
// itself is groupTasks, in workTaskStages).

type Person = { id: string; name: string; team?: { slug: string; name: string } | null };

// An editing-queue task: a whole row, shown with the editing board's own
// card and list row, so it opens and changes stage here exactly as it does
// there — Frame.io link on the way to approval, Drive link on delivery.
export type QueueCardData = Omit<TaskCardData, "assignedTo"> & { assignedTo: Person | null };

// What those cards need beyond the task itself, passed down once
export type QueueEnv = {
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags: TaskTagOption[];
};

export type Group = WorkGroup<WorkTaskCardData, QueueCardData>;

export function GroupHeader({ group, count, className = "" }: { group: Group; count: number; className?: string }) {
  const stage = group.status && WORK_TASK_STAGE[group.status];
  // the same quiet header the editing board's columns have: dot (or face),
  // name, count
  return (
    <div className={`flex items-center gap-2 px-1 py-1.5 text-sm font-medium ${className}`}>
      {stage && <span className={`h-2 w-2 rounded-full ${stage.dot}`} />}
      {group.person && <Avatar name={group.person} size={20} />}
      <span className="truncate whitespace-nowrap">{group.label}</span>
      <span className="ml-auto text-xs tabular-nums text-muted">{count}</span>
    </div>
  );
}

export function QueueCard({ task, env }: { task: QueueCardData; env: QueueEnv }) {
  return <TaskCard task={task} clientName={task.project.client.name} {...env} />;
}

export function QueueRow({ task, env }: { task: QueueCardData; env: QueueEnv }) {
  return (
    <TaskRow
      task={task}
      clientName={task.project.client.name}
      subtitle={`${task.project.client.name} · ${task.project.name || task.project.type}`}
      {...env}
    />
  );
}
