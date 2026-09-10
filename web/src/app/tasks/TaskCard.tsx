import { deleteTask } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesButton } from "./NotesButton";
import { EditTaskDialog } from "./EditTaskDialog";
import { StatusSelect } from "./StatusSelect";
import { ALL_STATUSES, canTransition, nextStatuses, type Role, type TaskStatus } from "@/lib/workflow";
import { colorFor, initials } from "@/lib/avatar";

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
  revision_requested: { field: "reviewNotes", label: "What needs to change?", placeholder: "Trim the intro…" },
  delivered_and_uploaded: { field: "driveLink", label: "Drive link", placeholder: "https://drive.google.com/…" },
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
  dueDate: Date | null;
  createdAt: Date;
  project: { client: { name: string } };
};

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-black"
      style={{ backgroundColor: colorFor(name) }}
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

  return (
    <div className="card-surface relative flex flex-col gap-2 rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted">{clientName}</p>
        {canManage && (
          <div className="flex shrink-0 gap-2 text-xs text-muted">
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
        {task.editingNotes && <NotesButton notes={task.editingNotes} />}
      </div>

      {task.assignedTo && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-2">
            <Avatar name={task.assignedTo.name} />
            {task.assignedTo.name}
          </span>
          <span>Assigned {formatDate(task.createdAt)}</span>
        </div>
      )}

      {task.status === "revision_requested" && (
        <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
          Waiting on the editor to pick this back up.
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
      />

      {(task.rawLink || task.referenceLink || task.assetLink || task.frameioLink || task.driveLink) && (
        <div className="flex flex-wrap gap-2">
          {task.rawLink && <Link href={task.rawLink} label="Raw" />}
          {task.referenceLink && <Link href={task.referenceLink} label="Reference" />}
          {task.assetLink && <Link href={task.assetLink} label="Assets" />}
          {task.frameioLink && <Link href={task.frameioLink} label="Frame.io" />}
          {task.driveLink && <Link href={task.driveLink} label="Drive" />}
        </div>
      )}
    </div>
  );
}
