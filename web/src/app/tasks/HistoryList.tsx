import type { TaskStatus } from "@/lib/workflow";

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  revision_requested: "Revision requested",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};

// read-only — once a task leaves an editor's hands it's a record for KPI
// tracking (turnaround time, revision count), not something they act on
export function HistoryList({
  tasks,
}: {
  tasks: { id: string; title: string; status: TaskStatus; updatedAt: Date; project: { client: { name: string } } }[];
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Nothing completed yet.</p>;
  }

  return (
    <section>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2 text-muted">{t.project.client.name}</td>
                <td className="px-3 py-2 text-muted">{STATUS_LABEL[t.status]}</td>
                <td className="px-3 py-2 text-muted">{t.updatedAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
