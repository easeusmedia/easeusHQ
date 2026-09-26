"use client";

import { useState } from "react";
import { Toolbar, ViewToggle, type View } from "../ViewToggle";
import { WorkTaskBoard } from "./WorkTaskBoard";
import { WorkTaskList } from "./WorkTaskList";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import { groupTasks, type GroupBy } from "@/lib/workTaskStages";
import type { QueueCardData, QueueEnv } from "./grouping";


const GROUP_LABEL: Record<GroupBy, string> = { status: "Status", person: "Person", team: "Team" };

export function WorkTaskView({
  tasks,
  queueTasks,
  queueEnv,
  groupOptions,
  teams,
  projects,
  actingUserId,
  showAssignee,
  canCreate,
  assignees = [],
  taskTags = [],
  canManageTags = false,
  toolbarCenter,
  contentKey = "",
  toolbarRight,
}: {
  tasks: WorkTaskCardData[];
  // editors' tasks from the client editing queue, shown alongside
  queueTasks: QueueCardData[];
  // what their cards need to open and move them; absent where there are none
  queueEnv?: QueueEnv;
  // the ways this scope can be laid out; the first is the default
  groupOptions: GroupBy[];
  teams: { slug: string; name: string }[];
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  canCreate: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
  // rendered into this component's own toolbar row rather than stacked
  // above it: the Board's Editors / team / Everyone switch in the middle,
  // the Notion sync on the right
  toolbarCenter?: React.ReactNode;
  // changes when the same view is showing different work (the Board's team
  // switch), so the new work eases in too
  contentKey?: string;
  toolbarRight?: React.ReactNode;
}) {
  const [view, setView] = useState<View>("board");
  const [groupPick, setGroupPick] = useState<GroupBy>(groupOptions[0]);
  // a pick the current scope doesn't offer (Team, after switching to one
  // team) falls back to that scope's default
  const groupBy = groupOptions.includes(groupPick) ? groupPick : groupOptions[0];
  const groups = groupTasks(groupBy, tasks, queueTasks, teams.map((t) => t.slug));

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        left={
          <>
            <ViewToggle view={view} onChange={setView} />
            {/* how the work is laid out — by stage, or by who's doing it */}
            {groupOptions.length > 1 && (
              <div className="segmented items-center">
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
          </>
        }
        center={toolbarCenter}
        right={
          <>
            {/* your own list has no "Up next" column to hold the inline
                New task, so it gets one here; a team's view has no create
                button at all */}
            {view === "list" && groupBy === "status" && canCreate && (
              <div className="w-fit">
                <WorkTaskDialog mode="create" projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
              </div>
            )}
            {toolbarRight}
          </>
        }
      />

      <div key={`${contentKey}-${view}-${groupBy}`} className="fade-in">
        {/* a status list drags like the board, so the board draws it too */}
        {view === "board" || groupBy === "status" ? (
          <WorkTaskBoard layout={view} tasks={tasks} groups={groups} groupBy={groupBy} queueEnv={queueEnv} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} canCreate={canCreate} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
        ) : (
          <WorkTaskList groups={groups} groupBy={groupBy} queueEnv={queueEnv} projects={projects} actingUserId={actingUserId} showAssignee={showAssignee} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
        )}
      </div>
    </div>
  );
}
