"use client";

import { useRef, useState } from "react";
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

type LogEntry = { createdAt: Date; action: string; actorName: string };

type HistoryTask = {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  driveLink: string | null;
  assignedTo: { name: string } | null;
  project: { client: { name: string } };
};

// read-only — once a task leaves an editor's hands it's a record for KPI
// tracking (turnaround time, revision count), not something they act on.
// Click a row to see the full step-by-step trail for that task (see
// history/page.tsx, which builds logsByTask from ActivityLog).
export function HistoryList({ tasks, logsByTask }: { tasks: HistoryTask[]; logsByTask: Record<string, LogEntry[]> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Nothing completed yet.</p>;
  }

  const selectedTask = tasks.find((t) => t.id === selectedId);
  const selectedLogs = selectedId ? logsByTask[selectedId] ?? [] : [];

  function open(id: string) {
    setSelectedId(id);
    dialogRef.current?.showModal();
  }

  return (
    <section>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Assigned</th>
              <th className="px-3 py-2 font-medium">Delivered</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Editor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Drive</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr
                key={t.id}
                onClick={() => open(t.id)}
                className="cursor-pointer border-t border-border hover:bg-surface-2"
              >
                <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(t.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(t.updatedAt)}</td>
                <td className="px-3 py-2 text-muted">{t.project.client.name}</td>
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2 text-muted">{t.assignedTo?.name ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{STATUS_LABEL[t.status]}</td>
                <td className="px-3 py-2">
                  {t.driveLink ? (
                    <a
                      href={t.driveLink}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 underline underline-offset-2"
                    >
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

      <dialog
        ref={dialogRef}
        onClose={() => setSelectedId(null)}
        className="glass fixed top-1/2 left-1/2 m-0 w-[36rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        {selectedTask && (
          <>
            <p className="text-sm font-medium">{selectedTask.title}</p>
            <p className="mb-3 text-xs text-muted">{selectedTask.project.client.name}</p>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Change</th>
                    <th className="px-2 py-1.5 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-muted">
                        No recorded activity.
                      </td>
                    </tr>
                  ) : (
                    selectedLogs.map((log, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted">{formatDate(log.createdAt)}</td>
                        <td className="px-2 py-1.5">{log.action}</td>
                        <td className="px-2 py-1.5 text-muted">{log.actorName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn-glow mt-3 w-full rounded-md px-3 py-2 text-xs font-medium"
            >
              Close
            </button>
          </>
        )}
      </dialog>
    </section>
  );
}
