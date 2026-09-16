"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { WorkTaskBoard } from "./WorkTaskBoard";
import { WorkTaskList } from "./WorkTaskList";
import { WorkTaskDialog } from "./WorkTaskDialog";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import { groupTasks, type GroupBy } from "@/lib/workTaskStages";
import type { QueueCardData } from "./grouping";

type Project = { id: string; name: string; client: { name: string } };

// Same toggle, same two-option segmented control as the Clients dashboard
// (see ClientsBoard.tsx) — one visual pattern for "view this data as a
// board or a list" everywhere it comes up, not a new one per page.
const GROUP_LABEL: Record<GroupBy, string> = { status: "Status", person: "Person", team: "Team" };

export function WorkTaskView({
  tasks,
  queueTasks,
  groupOptions,
  teams,
  projects,
  actingUserId,
  showAssignee,
  canCreate,
  assignees = [],
  taskTags = [],
  canManageTags = false,
  toolbarRight,
}: {
  tasks: WorkTaskCardData[];
  // editors' tasks from the client editing queue, shown alongside
  queueTasks: QueueCardData[];
  // the ways this scope can be laid out; status is always first
  groupOptions: GroupBy[];
  teams: { slug: string; name: string }[];
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  canCreate: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
  // the scope picker (Mine / Operations / …) and the Notion sync, rendered
  // into this component's own toolbar row rather than stacked above it —
  // two full-width control rows for two small controls was wasted height
  toolbarRight?: React.ReactNode;
}) {
  const [view, setView] = useState<"board" | "list">("board");
  const [groupPick, setGroupPick] = useState<GroupBy>("status");
  // switching to a narrower scope (Mine has no Person or Team) falls back
  const groupBy = groupOptions.includes(groupPick) ? groupPick : "status";
  const groups = groupTasks(groupBy, tasks, queueTasks, teams);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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

          {/* how the work is laid out — by stage, or by who's doing it */}
          {groupOptions.length > 1 && (
            <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-surface/60 p-1">
              <span className="px-2 text-xs text-muted">Group by</span>
              {groupOptions.map((key) => (
                <button
                  key={key}
                  onClick={() => setGroupPick(key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    groupBy === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {GROUP_LABEL[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* board mode already has its own "New task" trigger inline in the
              To-do column; list mode has no columns to put one in, so it
              gets one up here instead */}
          {(view === "list" || groupBy !== "status") && canCreate && (
            <div className="w-fit">
              <WorkTaskDialog mode="create" projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
            </div>
          )}
          {toolbarRight}
        </div>
      </div>

      {view === "board" ? (
        <WorkTaskBoard tasks={tasks} groups={groups} groupBy={groupBy} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} canCreate={canCreate} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
      ) : (
        <WorkTaskList groups={groups} groupBy={groupBy} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
      )}
    </div>
  );
}
