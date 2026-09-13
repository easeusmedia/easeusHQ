"use client";

import { useState } from "react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, type ProjectCardData } from "./ProjectCard";

const RECENT_CAP = 6;

// Default view is a handful of recent active projects — a client with a
// year of episodes shouldn't dump all of them on the page at once. "Show
// all" drops the cap and brings completed projects back in; the toggle
// flips back to the trimmed view just as easily.
export function ProjectsSection({ clientId, projects }: { clientId: string; projects: ProjectCardData[] }) {
  const [showAll, setShowAll] = useState(false);

  const active = projects.filter((p) => p.status !== "completed");
  const visible = showAll ? projects : active.slice(0, RECENT_CAP);
  const hiddenCount = projects.length - visible.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        <AddProjectCard clientId={clientId} />
        {visible.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      {(hiddenCount > 0 || showAll) && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-fit text-xs text-muted hover:text-foreground"
        >
          {showAll ? "Show only recent active projects" : `Show all ${projects.length} projects`}
        </button>
      )}
    </div>
  );
}
