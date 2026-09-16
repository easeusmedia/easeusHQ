"use client";

import { useState } from "react";
import { Board } from "./Board";
import { TaskRow } from "./TaskRow";
import { Toolbar, ViewToggle, type View } from "./ViewToggle";
import type { TaskCardData } from "./TaskCard";
import type { TaskTagOption } from "./TaskTagPicker";
import { STAGE } from "@/lib/stages";
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";

type Props = {
  tasks: TaskCardData[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  editors: { id: string; name: string }[];
  actingUserId: string;
  actingRole: Role;
  taskTags: TaskTagOption[];
  // the Board's Editors / team / Everyone switch, if this person has one
  switcher?: React.ReactNode;
};

// The editing queue, as the kanban board or as a list grouped by stage.
// The list is the same rows a client's page uses, so a task opens and moves
// stage from here exactly as it does there.
export function EditorsView({ switcher, ...props }: Props) {
  const [view, setView] = useState<View>("board");

  return (
    <>
      <Toolbar
        left={<ViewToggle view={view} onChange={setView} />}
        center={switcher}
        // the board's columns bring their own top padding; this eats most of
        // it so the gap under the toolbar matches the other views
        className={`px-6 pt-6 sm:px-8 sm:pt-8 ${view === "board" ? "-mb-2 sm:-mb-4" : ""}`}
      />
      {view === "board" ? (
        <Board {...props} canCreate />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4 sm:p-8 sm:pt-4">
          <EditorsList {...props} />
        </div>
      )}
    </>
  );
}

function EditorsList({ tasks, projects, editors, actingUserId, actingRole, taskTags }: Omit<Props, "switcher">) {
  const sections = ACTIVE_STATUSES.map((status) => ({
    status,
    rows: tasks.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((s) => s.rows.length > 0);

  if (sections.length === 0) return <p className="text-sm text-muted">Nothing in the editing queue.</p>;

  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ status, rows }) => (
        <section key={status} className="flex flex-col gap-2">
          <div className={`status-pop flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${STAGE[status].pill}`}>
            <span className={`h-2 w-2 rounded-full ${STAGE[status].dot}`} />
            {STAGE[status].label}
            <span className="rounded-full bg-black/20 px-2 text-xs">{rows.length}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  clientName={task.project.client.name}
                  subtitle={`${task.project.client.name} · ${task.project.name || task.project.type}`}
                  editors={editors}
                  projects={projects}
                  actingUserId={actingUserId}
                  actingRole={actingRole}
                  taskTags={taskTags}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
