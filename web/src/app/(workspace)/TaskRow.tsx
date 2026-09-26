"use client";

import { useRef } from "react";
import { ExternalLink } from "lucide-react";
import { AssigneeLabel, DueDate, StageColumn, type TaskCardData } from "./TaskCard";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { Checkbox } from "./Checkbox";
import { StatusSelect } from "./StatusSelect";
import { TaskTagChip, type TaskTagOption } from "./TaskTagPicker";
import { STAGE } from "@/lib/stages";
import { availableStatuses, type Role } from "@/lib/workflow";

// One task as a list row — the same click-to-open-details behaviour the
// board cards have, so a task is editable everywhere it's shown rather
// than only on the board.
export function TaskRow({
  task,
  clientName,
  subtitle,
  editors,
  projects,
  actingUserId,
  actingRole,
  taskTags = [],
  selected,
  onSelect,
}: {
  task: TaskCardData;
  clientName: string;
  subtitle: string;
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags?: TaskTagOption[];
  // present only where picking several at once is allowed (the list view,
  // for admin and core) — absent, the row has no checkbox at all
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const detailsRef = useRef<{ open: () => void }>(null);

  // whichever link matters at this stage — the same one the board card
  // shows. Openable straight from the row, so checking a cut doesn't mean
  // opening the task first.
  const spec = STAGE[task.status].link;
  const href = task[spec.field];

  const options = availableStatuses(task.status, {
    role: actingRole,
    isAssignee: task.assignedTo?.id === actingUserId,
  });

  return (
    <>
      <div
        onClick={() => detailsRef.current?.open()}
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
          selected ? "border-foreground/30 bg-surface-2" : "border-border/60 bg-surface-2/40 hover:bg-surface-2"
        }`}
      >
        {onSelect && (
          // The slot is always here, holding its width — so a row doesn't
          // shuffle sideways the moment the pointer touches it. Only the
          // checkbox itself fades in, and pointer events follow the fade so
          // an invisible one never swallows a click meant to open the task.
          <span
            onClick={(e) => e.stopPropagation()}
            className={`flex shrink-0 items-center transition-opacity duration-150 ease-out ${
              selected
                ? "opacity-100"
                : // pointer-coarse: a touchscreen has no hover (Tailwind only
                  // applies hover: where the device can), so there it's simply
                  // always shown — otherwise a phone or iPad could never select
                  "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
            }`}
          >
            <Checkbox checked={!!selected} onChange={() => onSelect(task.id)} label={`Select ${task.title}`} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{task.title}</span>
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>

        {task.tags.length > 0 && (
          <span className="hidden shrink-0 flex-wrap items-center gap-1 sm:flex">
            {task.tags.map((t) => (
              <TaskTagChip key={t.id} name={t.name} />
            ))}
          </span>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            // the row itself opens the task; this opens the file instead
            onClick={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            {spec.label} <ExternalLink size={11} />
          </a>
        )}

        {/* a fixed slot, so due dates line up down the list */}
        <span className="flex w-16 shrink-0 justify-end">
          {task.dueDate && <DueDate date={task.dueDate} done={task.status === "delivered_and_uploaded"} />}
        </span>
        {task.assignedTo && <AssigneeLabel name={task.assignedTo.name} />}
        {/* the stage is changed here, in place — it used to be a static
            badge, so moving a task on from this list meant opening it or
            going to the board. Same moveTask() and the same permission
            rules the board card uses. */}
        <StageColumn>
          <StatusSelect
            taskId={task.id}
            currentStatus={task.status}
            options={options}
                        links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
            variant="pill"
          />
        </StageColumn>
      </div>

      <TaskDetailsDialog
        ref={detailsRef}
        task={task}
        clientName={clientName}
        editors={editors}
        projects={projects}
        actingUserId={actingUserId}
        actingRole={actingRole}
        taskTags={taskTags}
      />
    </>
  );
}
