"use client";

import { useRef } from "react";
import { canTransition, nextStatuses, type Role } from "@/lib/workflow";
import { StatusBadge, STATUS_LINK, formatDate, type TaskCardData } from "./TaskCard";
import { NotesButton, linkify } from "./NotesButton";
import { StatusSelect } from "./StatusSelect";
import { TaskDetailsDialog } from "./TaskDetailsDialog";

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" className="text-xs text-blue-400 underline underline-offset-2">
      {label} ↗
    </a>
  );
}

// The editor's own view: no columns, no drag-and-drop, no other people's
// work — just a flat list of their own tasks with everything they need on
// one card, and a button for whatever comes next.
export function EditorTaskList({
  tasks,
  actingUserId,
  actingRole,
}: {
  tasks: TaskCardData[];
  actingUserId: string;
  actingRole: Role;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Nothing assigned to you right now.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {tasks.map((task) => {
        const options = nextStatuses(task.status).filter((to) =>
          canTransition(task.status, to, { role: actingRole, isAssignee: true })
        );
        const cardLinkSpec = STATUS_LINK[task.status];
        const cardLinkHref = cardLinkSpec ? task[cardLinkSpec.field] : null;
        const detailsRef = { current: null as { open: () => void } | null };

        return (
          <div
            key={task.id}
            onClick={() => detailsRef.current?.open()}
            className="card-surface relative flex cursor-pointer flex-col gap-2 rounded-xl p-4 pb-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted">{task.project.client.name}</p>
                <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                  <p className="font-medium leading-snug">{task.title}</p>
                  {task.editingNotes && <NotesButton notes={task.editingNotes} />}
                </span>
              </div>
              <StatusBadge status={task.status} />
            </div>

            {task.dueDate && <p className="text-xs text-muted">Due {formatDate(task.dueDate)}</p>}

            {task.reviewNotes && task.status === "revision_requested" && (
              <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
                Revision notes: {linkify(task.reviewNotes)}
              </p>
            )}

            {cardLinkHref && (
              <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-2 border-t border-border pt-2">
                <Link href={cardLinkHref} label={cardLinkSpec!.label} />
              </div>
            )}

            {task.status === "sent_for_approval" && (
              <p className="rounded-md bg-purple-400/10 px-2 py-1 text-xs text-purple-300">
                Sent — waiting on ops to review it.
              </p>
            )}

            {options.length > 0 && (
              <div onClick={(e) => e.stopPropagation()} className="border-t border-border pt-2">
                <StatusSelect
                  taskId={task.id}
                  currentStatus={task.status}
                  options={options}
                  actingUserId={actingUserId}
                  actingRole={actingRole}
                  links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
                />
              </div>
            )}

            <div onClick={(e) => e.stopPropagation()}>
              <TaskDetailsDialog
                ref={(instance) => {
                  detailsRef.current = instance;
                }}
                task={task}
                clientName={task.project.client.name}
                editors={[]}
                projects={[]}
                actingUserId={actingUserId}
                actingRole={actingRole}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
