"use client";

import { useEffect, useRef, useState } from "react";
import { List, LayoutGrid, PartyPopper } from "lucide-react";
import { Board } from "./Board";
import { EditorTaskList } from "./EditorTaskList";
import type { TaskCardData } from "./TaskCard";
import type { Role } from "@/lib/workflow";

type Mode = "list" | "board";
const STORAGE_KEY = "editor-view-mode";

// Same task data, two layouts — editors get the same board the ops team
// uses (read/act on their own cards only), or the simpler list view.
export function EditorViewToggle(props: {
  tasks: TaskCardData[];
  projects: { id: string; client: { name: string } }[];
  editors: { id: string; name: string }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [celebration, setCelebration] = useState<string | null>(null);
  const prevStatusRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "list" || stored === "board") setMode(stored);
    } catch {
      // ignore
    }
  }, []);

  // LiveRefresh polls every 5s — catch ops approving one of this editor's
  // tasks (sent_for_approval -> final_export_ready) and say so, since
  // otherwise the only sign is the card quietly changing column
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev) {
      for (const task of props.tasks) {
        if (prev.get(task.id) === "sent_for_approval" && task.status === "final_export_ready") {
          setCelebration(task.title);
        }
      }
    }
    prevStatusRef.current = new Map(props.tasks.map((t) => [t.id, t.status]));
  }, [props.tasks]);

  useEffect(() => {
    if (!celebration) return;
    const id = setTimeout(() => setCelebration(null), 7000);
    return () => clearTimeout(id);
  }, [celebration]);

  function pick(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {([
          { value: "list" as const, label: "List", Icon: List },
          { value: "board" as const, label: "Board", Icon: LayoutGrid },
        ]).map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => pick(value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              mode === value ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {mode === "list" ? (
        <EditorTaskList tasks={props.tasks} actingUserId={props.actingUserId} actingRole={props.actingRole} />
      ) : (
        <Board
          tasks={props.tasks}
          projects={props.projects}
          editors={props.editors}
          actingUserId={props.actingUserId}
          actingRole={props.actingRole}
          canCreate={false}
        />
      )}

      {celebration && (
        <div className="glass fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl">
          <PartyPopper size={18} className="shrink-0 text-emerald-300" />
          <p className="text-sm">
            <span className="font-medium">&ldquo;{celebration}&rdquo;</span> was approved — nice work!
          </p>
        </div>
      )}
    </div>
  );
}
