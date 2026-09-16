"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, type ProjectCardData } from "./ProjectCard";
import { DatePicker } from "../DatePicker";
import { paramOrProp, setParam } from "../urlState";
import { describeRule, invoiceBatches, type BillingRule } from "@/lib/invoiceBatches";

const PRESETS = [4, 8, 12] as const;
const DEFAULT_PRESET: (typeof PRESETS)[number] = 4;

// Projects already come in most-recent-first. Default view is just the
// last few — a client with a year of episodes shouldn't dump all of them
// on the page at once. Every way to widen that (a bigger preset, "All", or
// a specific date range) lives behind one Filter button instead of a row
// of separate controls.
//
// What's on show lives in the URL (?show=), for the same reason the open tab
// does: expanding to all 22 projects, opening one, and pressing Back used to
// collapse straight back to 4 — the project you'd just been looking at
// wasn't even on the page any more. It also has to be in the URL for scroll
// restoration to have anything to restore *to*, since the filter is what
// decides how tall this page is (see MainScroll).
export function ProjectsSection({
  clientId,
  projects,
  initialShow,
  billing,
  today,
}: {
  clientId: string;
  projects: ProjectCardData[];
  initialShow?: string;
  // the client's invoicing rule (Billing tab), for "show one invoice's worth"
  billing: BillingRule;
  // yyyy-mm-dd, from the server, so "is this invoice due yet" can't differ
  // between the server's render and the browser's
  today: string;
}) {
  const [preset, setPreset] = useState<number | "all">(() => {
    const show = paramOrProp("show", initialShow);
    if (show === "all") return "all";
    const n = Number(show);
    return (PRESETS as readonly number[]).includes(n) ? n : DEFAULT_PRESET;
  });
  const [batchKey, setBatchKey] = useState<string | null>(null);
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

  // an invoice covers finished work, so only finished projects count — which
  // also keeps out the catch-all project each client's tasks live in
  const batches = invoiceBatches(
    projects.filter((p) => p.completedAt),
    billing,
    today
  );
  const batch = batches.find((b) => b.key === batchKey) ?? null;
  const ruleText = describeRule(billing);
  const dateFilterActive = !!(from || to);
  // date is an ISO yyyy-mm-dd string, so a plain lexical comparison against
  // the picker's own yyyy-mm-dd values is already a correct date compare
  const dateFiltered = projects.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const visible = batch
    ? projects.filter((p) => batch.ids.includes(p.id))
    : dateFilterActive
      ? dateFiltered
      : preset === "all"
        ? projects
        : projects.slice(0, preset);
  const hiddenCount = projects.length - visible.length;
  const isDefault = !batch && !dateFilterActive && preset === DEFAULT_PRESET;

  // one filter at a time — a batch, a preset, or a date range
  function selectBatch(key: string) {
    setBatchKey(key);
    setFrom("");
    setTo("");
    setOpen(false);
  }
  function pickDate(set: (v: string) => void, v: string) {
    setBatchKey(null);
    set(v);
  }

  function selectPreset(p: number | "all") {
    setBatchKey(null);
    setPreset(p);
    setFrom("");
    setTo("");
    setOpen(false);
    setParam("show", p === DEFAULT_PRESET ? null : String(p));
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
                : "border-hover bg-hover text-foreground"
            }`}
          >
            <Filter size={12} />
            {isDefault
              ? "Filter"
              : batch
                ? batch.label
                : dateFilterActive
                  ? "Custom range"
                  : preset === "all"
                    ? "All"
                    : `Last ${preset}`}
          </button>

          {open && (
            // w-[21.5rem]: wide enough to hold the date pickers' own
            // calendar popovers (20rem) without them spilling off the edge
            <div className="pop-in absolute right-0 z-20 mt-1 w-[21.5rem] rounded-lg border border-border bg-surface-2 p-3 shadow-xl">
              <p className="mb-1.5 text-xs font-medium text-muted">Show</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => selectPreset(p)}
                    className={`rounded-md px-2 py-1 text-xs ${
                      !batch && !dateFilterActive && preset === p
                        ? "bg-hover text-foreground"
                        : "bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    Last {p}
                  </button>
                ))}
                <button
                  onClick={() => selectPreset("all")}
                  className={`rounded-md px-2 py-1 text-xs ${
                    !batch && !dateFilterActive && preset === "all"
                      ? "bg-hover text-foreground"
                      : "bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  All
                </button>
              </div>

              {/* one invoice's worth of work, per the client's billing rule */}
              <p className="mb-0.5 mt-3 text-xs font-medium text-muted">Invoice batch</p>
              {ruleText ? (
                <>
                  <p className="mb-1.5 text-xs text-muted/70">{ruleText}</p>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {batches.map((b) => (
                      <button
                        key={b.key}
                        onClick={() => selectBatch(b.key)}
                        title={`${b.ids.length} project${b.ids.length === 1 ? "" : "s"}${b.complete ? "" : " · not invoiced yet"}`}
                        className={`rounded-md px-2 py-1 text-xs ${
                          batchKey === b.key ? "bg-hover text-foreground" : "bg-surface text-muted hover:text-foreground"
                        }`}
                      >
                        {b.label}
                        {!b.complete && <span className="ml-1 text-emerald-300">•</span>}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted/70">No billing rule set for this client yet — add one on the Billing tab.</p>
              )}

              <p className="mb-1.5 mt-3 text-xs font-medium text-muted">Date range</p>
              <div className="flex flex-col gap-2">
                <DatePicker value={from} onChange={(v) => pickDate(setFrom, v)} placeholder="From…" />
                <DatePicker value={to} onChange={(v) => pickDate(setTo, v)} placeholder="To…" />
              </div>
              {dateFilterActive && (
                <button
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="mt-2 text-xs text-muted hover:text-foreground"
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
        {!batch && !dateFilterActive && hiddenCount > 0 && (
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
    <button onClick={onClick} className="group block w-full text-left">
      {/* The two layers behind trace the card's own box exactly: `inset-0`
          on a wrapper that is only as tall as the card, offset by an even
          6px then 12px. They used to be sized off the grid cell, which
          stretches to the tallest card in the row — so on a shorter card
          they hung past its bottom edge by different amounts, which is what
          read as an uneven stack. */}
      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-3 -translate-y-3 rounded-xl border border-border/40 bg-surface-2/25"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-xl border border-border/60 bg-surface-2/45"
        />
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
      </span>
    </button>
  );
}
