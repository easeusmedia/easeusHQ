"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { WorkTaskBoard } from "./WorkTaskBoard";
import { WorkTaskList } from "./WorkTaskList";
import { WorkTaskDialog } from "./WorkTaskDialog";
import type { WorkTaskCardData } from "./WorkTaskCard";

type Project = { id: string; name: string; client: { name: string } };

// Same toggle, same two-option segmented control as the Clients dashboard
// (see ClientsBoard.tsx) — one visual pattern for "view this data as a
// board or a list" everywhere it comes up, not a new one per page.
export function WorkTaskView({
  tasks,
  projects,
  actingUserId,
  showAssignee,
  canCreate,
}: {
  tasks: WorkTaskCardData[];
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  canCreate: boolean;
}) {
  const [view, setView] = useState<"board" | "list">("board");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface/60 p-1">
          {([["board", LayoutGrid, "Board"], ["list", List, "List"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-label={`${key} view`}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* board mode already has its own "New task" trigger inline in the
            To-do column; list mode has no columns to put one in, so it
            gets one up here instead */}
        {view === "list" && canCreate && (
          <div className="w-fit">
            <WorkTaskDialog mode="create" projects={projects} actingUserId={actingUserId} />
          </div>
        )}
      </div>

      {view === "board" ? (
        <WorkTaskBoard tasks={tasks} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} canCreate={canCreate} />
      ) : (
        <WorkTaskList tasks={tasks} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} />
      )}
    </div>
  );
}
