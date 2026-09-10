"use client";

import { useEffect, useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { Board } from "./Board";
import { EditorTaskList } from "./EditorTaskList";
import type { TaskCardData } from "./TaskCard";
import type { Role } from "@/lib/workflow";

type Mode = "list" | "board";
const STORAGE_KEY = "editor-view-mode";

// Same task data, two layouts — editors get the same board the ops team
// uses (read/act on their own cards only), or the simpler list view.
// The delivery-celebration toast lives in ApprovalWatcher (mounted in
// layout.tsx for every /tasks/* page), not here — it needs to keep
// working even when the editor isn't looking at this component at all.
export function EditorViewToggle(props: {
  tasks: TaskCardData[];
  projects: { id: string; client: { name: string } }[];
  editors: { id: string; name: string }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const [mode, setMode] = useState<Mode>("list");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "list" || stored === "board") setMode(stored);
    } catch {
      // ignore
    }
  }, []);

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
    </div>
  );
}
