"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { getTaskActivity } from "./actions";
import { formatDateTime } from "./TaskCard";

type LogEntry = { createdAt: Date; action: string; actorName: string };

// Small always-visible corner icon (not hover-only — this needs to be
// discoverable by everyone, editors included, not just whoever's already
// hovering the card) that opens the same trail the History page shows for
// completed tasks, but per-card and available at every stage. Fetched on
// click rather than preloaded with the board, since most cards' trails
// never get opened.
export function TaskActivityButton({ taskId }: { taskId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    ref.current?.showModal();
    if (logs !== null) return; // already fetched this open cycle
    setLoading(true);
    const result = await getTaskActivity(taskId);
    setLogs(result);
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Full activity trail"
        className="absolute bottom-2 right-2 text-muted opacity-60 transition-opacity hover:text-foreground hover:opacity-100"
      >
        <Info size={14} />
      </button>
      <dialog
        ref={ref}
        onClose={() => setLogs(null)}
        className="glass fixed top-1/2 left-1/2 m-0 w-[28rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <div className="mb-3 flex items-center gap-2">
          <Info size={14} />
          <p className="text-sm font-medium">Activity trail</p>
        </div>
        <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Change</th>
                <th className="px-2 py-1.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-muted">
                    Loading…
                  </td>
                </tr>
              ) : !logs || logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-muted">
                    No recorded activity.
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted">{formatDateTime(log.createdAt)}</td>
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
          onClick={() => ref.current?.close()}
          className="btn-glow mt-3 w-full rounded-md px-3 py-2 text-xs font-medium"
        >
          Close
        </button>
      </dialog>
    </>
  );
}
