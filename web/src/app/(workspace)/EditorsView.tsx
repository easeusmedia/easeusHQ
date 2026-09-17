"use client";

import { useState } from "react";
import { Board } from "./Board";
import { Toolbar, ViewToggle, type View } from "./ViewToggle";
import type { TaskCardData } from "./TaskCard";
import type { TaskTagOption } from "./TaskTagPicker";
import type { Role } from "@/lib/workflow";

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

// The editing queue, as the kanban board or as a list grouped by stage —
// one Board either way, so both drag, prompt and move by the same rules.
export function EditorsView({ switcher, ...props }: Props) {
  const [view, setView] = useState<View>("board");

  return (
    <>
      <Toolbar left={<ViewToggle view={view} onChange={setView} />} center={switcher} className="mb-1" />
      {view === "board" ? (
        <div key="board" className="fade-in">
          <Board {...props} canCreate />
        </div>
      ) : (
        <div key="list" className="fade-in pt-3">
          <Board {...props} canCreate layout="list" />
        </div>
      )}
    </>
  );
}
