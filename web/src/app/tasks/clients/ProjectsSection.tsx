"use client";

import { useState } from "react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, type ProjectCardData } from "./ProjectCard";
import { Dropdown } from "../Dropdown";

const RANGE_OPTIONS = [
  { value: "4", label: "Recent 4" },
  { value: "8", label: "Recent 8" },
  { value: "12", label: "Recent 12" },
  { value: "all", label: "All" },
];

// Projects already come in most-recent-first. Default view is just the
// last few — a client with a year of episodes shouldn't dump all of them
// on the page at once — with a range picker to pull in more, or all of
// them, right from the section header.
export function ProjectsSection({ clientId, projects }: { clientId: string; projects: ProjectCardData[] }) {
  const [range, setRange] = useState("4");

  const done = projects.filter((p) => p.status === "completed").length;
  const inProgress = projects.length - done;
  const visible = range === "all" ? projects : projects.slice(0, Number(range));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Projects</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {done} done · {inProgress} in progress
          </span>
          <div className="w-28">
            <Dropdown defaultValue={range} onChange={setRange} options={RANGE_OPTIONS} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        <AddProjectCard clientId={clientId} />
        {visible.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}
