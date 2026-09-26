"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Filter, LayoutGrid, List, Receipt } from "lucide-react";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, ProjectRow, type ProjectCardData } from "./ProjectCard";
import { DatePicker } from "../DatePicker";
import { paramOrProp, setParam } from "../urlState";
import { batchPayment, invoiceBatches, type BillingRule, type Payment } from "@/lib/invoiceBatches";
import { Dropdown } from "../Dropdown";
import { Reveal } from "../Reveal";

const PRESETS = [4, 8, 12] as const;

const PAYMENT: Record<Payment, { label: string; className: string }> = {
  paid: { label: "Paid", className: "border-green-400/30 bg-green-400/15 text-green-300" },
  unpaid: { label: "Unpaid", className: "border-amber-400/30 bg-amber-400/15 text-amber-300" },
  part_paid: { label: "Part paid", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  not_sent: { label: "Not invoiced yet", className: "border-border bg-surface text-muted" },
  not_marked: { label: "Payment not marked", className: "border-border bg-surface text-muted" },
};
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
  initialLayout,
  billing,
  today,
  projectBase,
}: {
  clientId: string;
  projects: ProjectCardData[];
  initialShow?: string;
  // ?layout=list from the server, for the first paint
  initialLayout?: string;
  // the client's invoicing rule (Billing tab), for "show one invoice's worth"
  billing: BillingRule;
  // yyyy-mm-dd, from the server, so "is this invoice due yet" can't differ
  // between the server's render and the browser's
  today: string;
  // the client's own page: where its projects open (…/<id>), and no adding
  // or deleting. A string, not a function — this comes from a server page.
  projectBase?: string;
}) {
  // "invoice": every project, in sections, one per invoice
  const [preset, setPreset] = useState<number | "all" | "invoice">(() => {
    const show = paramOrProp("show", initialShow);
    if (show === "all" || show === "invoice") return show;
    const n = Number(show);
    return (PRESETS as readonly number[]).includes(n) ? n : DEFAULT_PRESET;
  });
  // covers in a grid, or one project a row (?layout=list)
  const [list, setList] = useState(() => paramOrProp("layout", initialLayout) === "list");
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
  const dateFilterActive = !!(from || to);
  // the By invoice view (the switch beside Filter) — its own way of seeing
  // everything, so the filters step aside while it's on
  const grouped = preset === "invoice" && batches.length > 0;
  // what isn't finished yet belongs to no invoice, so it leads, on its own
  const unfinished = projects.filter((p) => !p.completedAt);
  const groups = grouped
    ? [
        ...(unfinished.length
          ? [{ key: "unfinished", label: "Not finished yet", detail: `${unfinished.length} project${unfinished.length === 1 ? "" : "s"}`, items: unfinished, payment: null }]
          : []),
        ...batches.map((b) => {
          const items = projects.filter((p) => b.ids.includes(p.id));
          return { key: b.key, label: b.label, detail: b.detail, items, payment: batchPayment(items.map((p) => p.invoiceStatus), b.complete) };
        }),
      ]
    : [];
  // By invoice is a ledger, not a wall of cards: one row per invoice, closed,
  // opened on a click. Only the first starts open — what's in hand right
  // now (the unfinished work, else the current invoice).
  // Stored as what's been flipped from that default rather than what's open,
  // so switching into this view later still opens the first one.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setFlipped((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // date is an ISO yyyy-mm-dd string, so a plain lexical comparison against
  // the picker's own yyyy-mm-dd values is already a correct date compare
  const dateFiltered = projects.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const visible = batch
    ? projects.filter((p) => batch.ids.includes(p.id))
    : dateFilterActive
      ? dateFiltered
      : preset === "all" || preset === "invoice"
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

  function selectPreset(p: number | "all" | "invoice") {
    setBatchKey(null);
    setPreset(p);
    setFrom("");
    setTo("");
    setOpen(false);
    setParam("show", p === DEFAULT_PRESET ? null : String(p));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* title · how to view, centred · what to show */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <h2 className="text-sm font-medium">Projects</h2>
        <div className="flex rounded-md border border-border bg-surface-2 p-0.5">
          {(
            [
              [false, LayoutGrid, "Grid"],
              [true, List, "List"],
            ] as const
          ).map(([on, Icon, label]) => (
            <button
              key={label}
              onClick={() => {
                setList(on);
                setParam("layout", on ? "list" : null);
              }}
              aria-pressed={list === on}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                list === on ? "bg-hover text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div ref={ref} className="relative flex items-center gap-2 justify-self-end">
          {!isDefault && (
            <button onClick={() => selectPreset(DEFAULT_PRESET)} className="text-xs text-muted hover:text-foreground">
              Reset
            </button>
          )}
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
              : grouped
                ? "By invoice"
                : batch
                ? batch.label
                : dateFilterActive
                  ? "Custom range"
                  : typeof preset === "number"
                    ? `Last ${preset}`
                    : "All"}
          </button>

          {open && (
            // never wider than the screen, so it can't run off a phone's edge
            <div className="pop-in absolute right-0 top-full z-20 mt-1 w-[min(21.5rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-2 p-3 shadow-xl">
              {/* how to look at them: as a list, or split into the invoices
                  they were billed in — only where the client has a rule */}
              {batches.length > 0 && (
                <>
                  <p className="mb-1.5 text-xs font-medium text-muted">View</p>
                  <div className="mb-3 flex gap-1.5">
                    {(
                      [
                        [false, LayoutGrid, "Projects"],
                        [true, Receipt, "By invoice"],
                      ] as const
                    ).map(([on, Icon, label]) => (
                      <button
                        key={label}
                        onClick={() => selectPreset(on ? "invoice" : DEFAULT_PRESET)}
                        aria-pressed={grouped === on}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                          grouped === on ? "bg-hover text-foreground" : "bg-surface text-muted hover:text-foreground"
                        }`}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* the by-invoice view already shows everything, so the ways of
                  narrowing a list only apply to the list */}
              {!grouped && (
                <>
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

                  {/* One invoice's worth of work, by the client's billing rule
                      (every N projects, or once a month). A single field like the
                      dates above, named the way the invoice itself is. */}
                  <p className="mb-1.5 mt-3 text-xs font-medium text-muted">Invoice</p>
                  {batches.length > 0 ? (
                    <Dropdown
                      key={batchKey ?? "any"}
                      defaultValue={batchKey ?? ""}
                      placeholder="Any invoice"
                      onChange={(v) => (v ? selectBatch(v) : setBatchKey(null))}
                      options={[
                        { value: "", label: "Any invoice" },
                        ...batches.map((b) => ({ value: b.key, label: `${b.label} · ${b.detail}` })),
                      ]}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
                      {billing.cadence ? "No finished projects to invoice yet" : "No invoicing rule set for this client"}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div key={`${list}-${preset}-${batchKey}-${from}-${to}`} className="fade-in">
      {grouped ? (
        <div className="flex flex-col gap-2">
          {groups.map((g, i) => {
            const isOpen = (i === 0) !== flipped.has(g.key);
            const covers = g.items.map((p) => p.coverUrl).filter(Boolean).slice(0, 3) as string[];
            return (
              <section key={g.key} className="overflow-hidden rounded-xl border border-border/60 bg-surface/40">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
                >
                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{g.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {g.detail}
                      {g.key !== "unfinished" && ` · ${g.items.length} project${g.items.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {/* a glance at what's in it, without opening it */}
                  {covers.length > 0 && (
                    <span className="ml-auto hidden shrink-0 -space-x-3 sm:flex">
                      {covers.map((c, j) => (
                        // eslint-disable-next-line @next/next/no-img-element -- small local thumbnails
                        <img
                          key={j}
                          src={c}
                          alt=""
                          className="h-8 w-14 rounded-md border-2 border-background object-cover"
                        />
                      ))}
                    </span>
                  )}
                  {g.payment ? (
                    <span
                      className={`${covers.length ? "" : "ml-auto"} shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT[g.payment].className}`}
                    >
                      {PAYMENT[g.payment].label}
                    </span>
                  ) : (
                    !covers.length && <span className="ml-auto" />
                  )}
                </button>
                <Reveal open={isOpen}>
                  <div className="border-t border-border/60 p-3">
                    {list ? (
                      <div className="flex flex-col gap-3">
                        {i === 0 && !projectBase && <AddProjectCard clientId={clientId} row />}
                        <ProjectRows projects={g.items} projectBase={projectBase} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                        {i === 0 && !projectBase && <AddProjectCard clientId={clientId} />}
                        {g.items.map((p) => (
                          <ProjectCard key={p.id} project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} readOnly={!!projectBase} />
                        ))}
                      </div>
                    )}
                  </div>
                </Reveal>
              </section>
            );
          })}
        </div>
      ) : list ? (
        <div className="flex flex-col gap-3">
          {!projectBase && <AddProjectCard clientId={clientId} row />}
          <ProjectRows projects={visible} projectBase={projectBase} />
          {!batch && !dateFilterActive && hiddenCount > 0 && (
            <button onClick={() => selectPreset("all")} className="self-start text-xs text-muted hover:text-foreground">
              Show {hiddenCount} more
            </button>
          )}
          {dateFilterActive && visible.length === 0 && <p className="text-sm text-muted">No projects in that range.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {!projectBase && <AddProjectCard clientId={clientId} />}
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} readOnly={!!projectBase} />
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
      )}
      </div>
    </div>
  );
}

function ProjectRows({ projects, projectBase }: { projects: ProjectCardData[]; projectBase?: string }) {
  if (projects.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40">
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} />
      ))}
    </ul>
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
