import { updateTaskStatus, updateTask, deleteTask } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesButton } from "./NotesButton";
import { canTransition, nextStatuses, type Role, type TaskStatus } from "@/lib/workflow";
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
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export type TaskCardData = {
  id: string;
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
  actingUserId,
  actingRole,
}: {
  task: TaskCardData;
  clientName: string;
  editors: { id: string; name: string }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const isAssignee = task.assignedTo?.id === actingUserId;
  const canManage = actingRole === "admin" || actingRole === "core";
  const options = nextStatuses(task.status).filter((to) =>
    canTransition(task.status, to, { role: actingRole, isAssignee })
  );

  return (
    <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm transition-colors hover:bg-surface-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted">{clientName}</p>
        {canManage && (
          <div className="flex shrink-0 gap-2 text-xs text-muted">
            <details>
              <summary className="cursor-pointer list-none hover:text-foreground">Edit</summary>
              <form
                action={updateTask}
                className="absolute z-10 mt-1 flex w-60 flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-2 shadow-lg"
              >
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="actingRole" value={actingRole} />
                <input name="title" defaultValue={task.title} required className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
                <select name="assignedToId" defaultValue={task.assignedTo?.id ?? ""} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
                  <option value="">Unassigned</option>
                  {editors.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <input name="rawLink" defaultValue={task.rawLink ?? ""} placeholder="Raw footage (Google Drive link)" className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
                <input name="referenceLink" defaultValue={task.referenceLink ?? ""} placeholder="Reference link" className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
                <input name="assetLink" defaultValue={task.assetLink ?? ""} placeholder="Assets link" className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
                <textarea
                  name="editingNotes"
                  defaultValue={task.editingNotes ?? ""}
                  placeholder="Editing notes for the editor — instructions, references, anything they need…"
                  rows={3}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                />
                <button className="btn-glow rounded-md px-3 py-2 text-xs font-medium">Save</button>
              </form>
            </details>
            <form action={deleteTask}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="actingRole" value={actingRole} />
              <ConfirmButton message={`Delete "${task.title}"?`} className="hover:text-red-400">
                Delete
              </ConfirmButton>
            </form>
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

      {options.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          {options.map((to) => {
            const hiddenFields = (
              <>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="from" value={task.status} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="actingUserId" value={actingUserId} />
                <input type="hidden" name="actingRole" value={actingRole} />
              </>
            );
            const extra = EXTRA_FIELD[to];

            // no extra info needed — a single button submits the move
            if (!extra) {
              return (
                <form key={to} action={updateTaskStatus}>
                  {hiddenFields}
                  <button type="submit" className="btn-glow w-full rounded-md px-3 py-2 text-xs font-medium">
                    → {STATUS_LABEL[to]}
                  </button>
                </form>
              );
            }

            // needs a link/note first — keep it out of sight until asked for
            return (
              <details key={to}>
                <summary className="btn-glow list-none cursor-pointer rounded-md px-3 py-2 text-center text-xs font-medium">
                  → {STATUS_LABEL[to]}
                </summary>
                <form action={updateTaskStatus} className="mt-1.5 flex flex-col gap-1.5">
                  {hiddenFields}
                  <input
                    name={extra.field}
                    placeholder={extra.placeholder}
                    required
                    autoFocus
                    className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  />
                  <button type="submit" className="btn-glow w-full rounded-md px-3 py-2 text-xs font-medium">
                    Confirm
                  </button>
                </form>
              </details>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-2">
        {task.rawLink && <Link href={task.rawLink} label="Raw" />}
        {task.referenceLink && <Link href={task.referenceLink} label="Reference" />}
        {task.assetLink && <Link href={task.assetLink} label="Assets" />}
        {task.frameioLink && <Link href={task.frameioLink} label="Frame.io" />}
        {task.driveLink && <Link href={task.driveLink} label="Drive" />}
      </div>
    </div>
  );
}
