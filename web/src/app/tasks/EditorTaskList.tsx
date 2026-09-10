import { canTransition, nextStatuses, type Role } from "@/lib/workflow";
import { StatusBadge, formatDate, type TaskCardData } from "./TaskCard";
import { NotesButton } from "./NotesButton";
import { StatusSelect } from "./StatusSelect";

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

        return (
          <div key={task.id} className="card-surface flex flex-col gap-2 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted">{task.project.client.name}</p>
                <span className="flex items-center gap-1.5">
                  <p className="font-medium leading-snug">{task.title}</p>
                  {task.editingNotes && <NotesButton notes={task.editingNotes} />}
                </span>
              </div>
              <StatusBadge status={task.status} />
            </div>

            <p className="text-xs text-muted">
              Assigned {formatDate(task.createdAt)}
              {task.dueDate && <> · Due {formatDate(task.dueDate)}</>}
            </p>

            {task.reviewNotes && task.status === "revision_requested" && (
              <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
                Revision notes: {task.reviewNotes}
              </p>
            )}

            {(task.rawLink || task.referenceLink || task.assetLink || task.frameioLink) && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                {task.rawLink && <Link href={task.rawLink} label="Raw footage" />}
                {task.referenceLink && <Link href={task.referenceLink} label="Reference" />}
                {task.assetLink && <Link href={task.assetLink} label="Assets" />}
                {task.frameioLink && <Link href={task.frameioLink} label="Frame.io" />}
              </div>
            )}

            {task.status === "sent_for_approval" && (
              <p className="rounded-md bg-purple-400/10 px-2 py-1 text-xs text-purple-300">
                Sent — waiting on ops to review it.
              </p>
            )}

            {options.length > 0 && (
              <div className="border-t border-border pt-2">
                <StatusSelect
                  taskId={task.id}
                  currentStatus={task.status}
                  options={options}
                  actingUserId={actingUserId}
                  actingRole={actingRole}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
