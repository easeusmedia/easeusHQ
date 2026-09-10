import { formatDate } from "./TaskCard";
import type { TaskStatus } from "@/lib/workflow";

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  revision_requested: "Revision requested",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};

type HistoryTask = {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: Date;
  driveLink: string | null;
  frameioLink: string | null;
  assignedTo: { name: string } | null;
  project: { client: { name: string } };
};

// read-only — once a task leaves an editor's hands it's a record for KPI
// tracking (turnaround time, revision count), not something they act on.
// Sorted newest-first by the caller (updatedAt desc), i.e. by the date the
// task was actually delivered.
export function HistoryList({ tasks }: { tasks: HistoryTask[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Nothing completed yet.</p>;
  }

  return (
    <section>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Delivered</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Editor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Frame.io</th>
              <th className="px-3 py-2 font-medium">Drive</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(t.updatedAt)}</td>
                <td className="px-3 py-2 text-muted">{t.project.client.name}</td>
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2 text-muted">{t.assignedTo?.name ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{STATUS_LABEL[t.status]}</td>
                <td className="px-3 py-2">
                  {t.frameioLink ? (
                    <a href={t.frameioLink} target="_blank" className="text-blue-400 underline underline-offset-2">
                      View ↗
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.driveLink ? (
                    <a href={t.driveLink} target="_blank" className="text-blue-400 underline underline-offset-2">
                      View ↗
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
