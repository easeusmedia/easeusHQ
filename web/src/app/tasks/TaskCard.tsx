import { deleteTask } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesButton } from "./NotesButton";
import { EditTaskDialog } from "./EditTaskDialog";
import { StatusSelect } from "./StatusSelect";
import { ALL_STATUSES, canTransition, nextStatuses, type Role, type TaskStatus } from "@/lib/workflow";
import { colorFor, initials } from "@/lib/avatar";
import { RotateCcw } from "lucide-react";
import { TaskActivityButton } from "./TaskActivityButton";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  revision_requested: "Revision requested",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};

// Notion-style colored status tags — same hues as the board's column dots.
export const STATUS_STYLE: Record<TaskStatus, string> = {
  queued: "bg-surface text-muted border-border",
  editing: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  sent_for_approval: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  revision_requested: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  final_export_ready: "bg-green-400/15 text-green-300 border-green-400/30",
  delivered_and_uploaded: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
};

// columns/actions that need one extra piece of info before landing there —
// collected inline (button click reveals the field) rather than shown
// up front on every card
export const EXTRA_FIELD: Partial<Record<TaskStatus, { field: "frameioLink" | "driveLink" | "reviewNotes"; label: string; placeholder: string }>> = {
  sent_for_approval: { field: "frameioLink", label: "Frame.io link", placeholder: "https://f.io/…" },
  // no extra prompt for revision_requested — the change notes already live
  // on the Frame.io comment thread, no need to duplicate them here
  delivered_and_uploaded: { field: "driveLink", label: "Final Drive link", placeholder: "https://drive.google.com/…" },
};

// which single link matters most on the card depends on where the task is
// in the workflow — the raw footage while it's being cut, the Frame.io
// thread while it's under review, the final export once it's ready to hand
// off — showing all of them at once regardless of stage was just noise
export const STATUS_LINK: Partial<Record<TaskStatus, { field: "rawLink" | "frameioLink" | "driveLink"; label: string }>> = {
  queued: { field: "rawLink", label: "Raw" },
  editing: { field: "rawLink", label: "Raw" },
  sent_for_approval: { field: "frameioLink", label: "Frame.io" },
  revision_requested: { field: "frameioLink", label: "Frame.io" },
  final_export_ready: { field: "driveLink", label: "Drive" },
  delivered_and_uploaded: { field: "driveLink", label: "Drive" },
};

// UTC-based (not toLocaleDateString) so server-rendered HTML always matches
// what the browser hydrates with — locale/timezone differences between the
// two otherwise cause a hydration mismatch.
export function formatDate(d: Date | string) {
  const date = new Date(d);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-pop shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export type TaskCardData = {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assignedTo: { id: string; name: string } | null;
  rawLink: string | null;
  referenceLink: string | null;
  assetLink: string | null;
  frameioLink: string | null;
  driveLink: string | null;
  reviewNotes: string | null;
  editingNotes: string | null;
  revisionCount: number;
  dueDate: Date | null;
  createdAt: Date;
  sortOrder: number;
  project: { client: { name: string } };
};

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-black"
      style={{ backgroundColor: colorFor(name), width: size, height: size, fontSize: size * 0.42 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" className="text-xs text-blue-400 underline underline-offset-2">
      {label} ↗
    </a>
  );
}

export function TaskCard({
  task,
  clientName,
  editors,
  projects,
  actingUserId,
  actingRole,
}: {
  task: TaskCardData;
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; client: { name: string } }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const isAssignee = task.assignedTo?.id === actingUserId;
  const canManage = actingRole === "admin" || actingRole === "core";
  // ops has full manual override (see workflow.ts), so give them every other
  // status to jump to directly, not just the one guided "next" step
  const options = canManage
    ? ALL_STATUSES.filter((s) => s !== task.status)
    : nextStatuses(task.status).filter((to) => canTransition(task.status, to, { role: actingRole, isAssignee }));

  const cardLinkSpec = STATUS_LINK[task.status];
  const cardLinkHref = cardLinkSpec ? task[cardLinkSpec.field] : null;

  return (
    <div className="card-surface group relative flex flex-col gap-2 rounded-xl p-3 pb-6 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted">{clientName}</p>
        {canManage && (
          <div className="flex shrink-0 gap-2 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <EditTaskDialog task={task} editors={editors} projects={projects} actingRole={actingRole} />
            <form id={`delete-${task.id}`} action={deleteTask}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="actingRole" value={actingRole} />
            </form>
            <ConfirmButton
              message={`Delete "${task.title}"?`}
              className="hover:text-red-400"
              formId={`delete-${task.id}`}
            >
              Delete
            </ConfirmButton>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{task.title}</p>
        <div className="flex shrink-0 items-center gap-2">
          {task.revisionCount > 0 && (
            <span className="group/rev relative flex items-center gap-1 rounded-full bg-orange-400/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-300">
              <RotateCcw size={10} />
              {task.revisionCount}
              <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 w-max max-w-[12rem] rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover/rev:opacity-100">
                Sent back for revision {task.revisionCount} time{task.revisionCount === 1 ? "" : "s"}
              </span>
            </span>
          )}
          {task.editingNotes && <NotesButton notes={task.editingNotes} />}
        </div>
      </div>

      {task.assignedTo && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Avatar name={task.assignedTo.name} />
          {task.assignedTo.name}
        </div>
      )}

      {task.status === "revision_requested" && canManage && (
        <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
          Waiting on the editor to pick this back up.
        </p>
      )}
      {task.status === "revision_requested" && actingRole === "employee" && (
        <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
          Revision requested — check the notes and resume editing.
        </p>
      )}

      {task.status === "sent_for_approval" && actingRole === "employee" && (
        <p className="rounded-md bg-purple-400/10 px-2 py-1 text-xs text-purple-300">
          Sent — waiting on ops to review it.
        </p>
      )}

      <StatusSelect
        taskId={task.id}
        currentStatus={task.status}
        options={options}
        actingUserId={actingUserId}
        actingRole={actingRole}
        links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
      />

      {cardLinkHref && (
        <div className="flex flex-wrap gap-2">
          <Link href={cardLinkHref} label={cardLinkSpec!.label} />
        </div>
      )}

      <TaskActivityButton taskId={task.id} />
    </div>
  );
}
