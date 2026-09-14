"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, type ProjectCardData } from "./ProjectCard";
import { DatePicker } from "../DatePicker";

const PRESETS = [4, 8, 12] as const;
const DEFAULT_PRESET: (typeof PRESETS)[number] = 4;

// Projects already come in most-recent-first. Default view is just the
// last few — a client with a year of episodes shouldn't dump all of them
// on the page at once. Every way to widen that (a bigger preset, "All", or
// a specific date range) lives behind one Filter button instead of a row
// of separate controls.
export function ProjectsSection({ clientId, projects }: { clientId: string; projects: ProjectCardData[] }) {
  const [preset, setPreset] = useState<number | "all">(DEFAULT_PRESET);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const dateFilterActive = !!(from || to);
  // date is an ISO yyyy-mm-dd string, so a plain lexical comparison against
  // the picker's own yyyy-mm-dd values is already a correct date compare
  const dateFiltered = projects.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const visible = dateFilterActive ? dateFiltered : preset === "all" ? projects : projects.slice(0, preset);
  const hiddenCount = projects.length - visible.length;
  const isDefault = !dateFilterActive && preset === DEFAULT_PRESET;

  function selectPreset(p: number | "all") {
    setPreset(p);
    setFrom("");
    setTo("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Projects</h2>

        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
              isDefault
                ? "border-border bg-surface-2 text-muted hover:text-foreground"
                : "border-blue-400/30 bg-blue-400/10 text-blue-200"
            }`}
          >
            <Filter size={12} />
            {isDefault ? "Filter" : dateFilterActive ? "Custom range" : preset === "all" ? "All" : `Last ${preset}`}
          </button>

          {open && (
            // w-[21.5rem]: wide enough to hold the date pickers' own
            // calendar popovers (20rem) without them spilling off the edge
            <div className="absolute right-0 z-20 mt-1 w-[21.5rem] rounded-lg border border-border bg-surface-2 p-3 shadow-xl">
              <p className="mb-1.5 text-[11px] font-medium text-muted">Show</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => selectPreset(p)}
                    className={`rounded-md px-2 py-1 text-xs ${
                      !dateFilterActive && preset === p
                        ? "bg-blue-400/20 text-blue-200"
                        : "bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    Last {p}
                  </button>
                ))}
                <button
                  onClick={() => selectPreset("all")}
                  className={`rounded-md px-2 py-1 text-xs ${
                    !dateFilterActive && preset === "all"
                      ? "bg-blue-400/20 text-blue-200"
                      : "bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  All
                </button>
              </div>

              <p className="mb-1.5 mt-3 text-[11px] font-medium text-muted">Date range</p>
              <div className="flex flex-col gap-2">
                <DatePicker value={from} onChange={setFrom} placeholder="From…" />
                <DatePicker value={to} onChange={setTo} placeholder="To…" />
              </div>
              {dateFilterActive && (
                <button
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="mt-2 text-[11px] text-muted hover:text-foreground"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        <AddProjectCard clientId={clientId} />
        {visible.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {!dateFilterActive && hiddenCount > 0 && (
          <MoreProjectsCard
            count={hiddenCount}
            cover={projects[visible.length]?.coverUrl ?? null}
            onClick={() => selectPreset("all")}
          />
        )}
        {dateFilterActive && visible.length === 0 && (
          <p className="col-span-full text-sm text-muted">No projects in that range.</p>
        )}
      </div>
    </div>
  );
}

// A peek of the projects still hidden, stacked behind the front face like a
// deck of cards, instead of a plain text link below the grid. The front
// face reuses one of the actual hidden covers (grayscale + faded) so it
// reads as "more of this", not a generic placeholder.
function MoreProjectsCard({ count, cover, onClick }: { count: number; cover: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group relative text-left">
      <div className="absolute -top-3 -right-3 h-full w-full rounded-xl border border-border/40 bg-surface-2/25" />
      <div className="absolute -top-1.5 -right-1.5 h-full w-full rounded-xl border border-border/60 bg-surface-2/45" />
      <div className="card-surface card-interactive relative flex flex-col overflow-hidden rounded-xl shadow-sm">
        <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover opacity-40 grayscale transition-opacity group-hover:opacity-55"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="text-sm font-medium text-white">More Projects</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <p className="text-[13px] font-medium text-muted">+{count} more</p>
        </div>
      </div>
    </button>
  );
}
