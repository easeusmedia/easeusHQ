"use client";

import { useRef, useState } from "react";

export type DayEntry = { taskId: string; title: string; clientName: string; action: string; actorName: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// UTC-based date math throughout (see TaskCard's formatDate) so the grid
// renders the same on the server and after hydration.
export function CalendarGrid({
  year,
  month, // 0-indexed
  days,
}: {
  year: number;
  month: number;
  days: Record<string, DayEntry[]>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  function open(key: string) {
    setSelected(key);
    dialogRef.current?.showModal();
  }

  const selectedEntries = selected ? (days[selected] ?? []) : [];
  const selectedTaskCount = new Set(selectedEntries.map((e) => e.taskId)).size;

  return (
    <div>
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs font-medium text-muted">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entries = days[key];
          const taskCount = entries ? new Set(entries.map((e) => e.taskId)).size : 0;
          const isToday = key === todayKey;

          return (
            <button
              key={i}
              type="button"
              onClick={() => taskCount > 0 && open(key)}
              className={`card-surface flex h-20 flex-col items-start gap-1 rounded-lg p-2 text-left ${
                taskCount > 0 ? "cursor-pointer" : "cursor-default"
              } ${isToday ? "border-blue-400/50" : ""}`}
            >
              <span className={`text-xs ${isToday ? "font-semibold text-blue-300" : "text-muted"}`}>{day}</span>
              {taskCount > 0 && (
                <span className="status-pop rounded-full border border-blue-400/30 bg-blue-400/15 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                  {taskCount} task{taskCount === 1 ? "" : "s"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        className="glass fixed top-1/2 left-1/2 m-0 w-96 max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="mb-3 text-sm font-medium">
          {selected} — {selectedTaskCount} task{selectedTaskCount === 1 ? "" : "s"}
        </p>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {selectedEntries.map((e, i) => (
            <div key={i} className="rounded-md border border-border bg-surface-2 p-2 text-xs">
              <p className="font-medium text-foreground">
                {e.clientName} — {e.title}
              </p>
              <p className="mt-0.5 text-muted">
                {e.action} · {e.actorName}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="btn-glow mt-3 w-full rounded-md px-3 py-2 text-xs font-medium"
        >
          Close
        </button>
      </dialog>
    </div>
  );
}
