"use client";

import { useState } from "react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, type ProjectCardData } from "./ProjectCard";

const RECENT_CAP = 4;

// Projects already come in most-recent-first. Default view is just the
// last few — a client with a year of episodes shouldn't dump all of them
// on the page at once — with "More" pulling in the rest, or a date range
// to jump straight to a specific stretch of episodes.
export function ProjectsSection({ clientId, projects }: { clientId: string; projects: ProjectCardData[] }) {
  const [showAll, setShowAll] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dateFilterActive = !!(from || to);

  // date is an ISO yyyy-mm-dd string, so a plain lexical comparison against
  // the <input type="date"> values (same format) is a correct date compare
  const dateFiltered = projects.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const visible = dateFilterActive ? dateFiltered : showAll ? projects : projects.slice(0, RECENT_CAP);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Projects</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
          />
          {dateFilterActive && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="text-xs text-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        <AddProjectCard clientId={clientId} />
        {visible.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {dateFilterActive && visible.length === 0 && (
          <p className="col-span-full text-sm text-muted">No projects in that range.</p>
        )}
      </div>

      {!dateFilterActive && projects.length > RECENT_CAP && (
        <button onClick={() => setShowAll((v) => !v)} className="w-fit text-xs text-muted hover:text-foreground">
          {showAll ? "Show less" : `More (${projects.length - RECENT_CAP} more)`}
        </button>
      )}
    </div>
  );
}
