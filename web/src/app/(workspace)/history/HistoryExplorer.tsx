"use client";

import { useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Filter, Search } from "lucide-react";
import { ConfirmButton } from "../ConfirmButton";
import { deleteTaskPermanently } from "../actions";
import { formatDate, formatDateTime } from "../TaskCard";
import { DatePicker } from "../DatePicker";
import { Dropdown } from "../Dropdown";
import { Toolbar } from "../ViewToggle";
import { TaskTagChip } from "../TaskTagPicker";
import { STAGE } from "@/lib/stages";
import type { TaskStatus } from "@/lib/workflow";
import { activeHours, filterHistory, onTime, summarize, turnaroundHours, type Filters, type GroupBy, type HistoryItem } from "@/lib/history";

type Wire = Omit<HistoryItem, "createdAt" | "startedAt" | "completedAt" | "dueDate"> & {
  createdAt: string | Date;
  startedAt: string | Date | null;
  completedAt: string | Date;
  dueDate: string | Date | null;
};

const VIEWS: { key: "list" | GroupBy; label: string; column: string }[] = [
  { key: "list", label: "Every task", column: "Task" },
  { key: "person", label: "By person", column: "Person" },
  { key: "team", label: "By team", column: "Team" },
  { key: "client", label: "By client", column: "Client" },
  { key: "tag", label: "By type of work", column: "Type of work" },
  { key: "month", label: "By month", column: "Month" },
];

const columnFor = (view: "list" | GroupBy) => VIEWS.find((v) => v.key === view)!.column;

// the stored keys ("sent_for_approval") read as the stage names the board uses
const stageName = (key: string) => STAGE[key as TaskStatus]?.label ?? key;

const hoursLabel = (h: number | null) => (h === null ? "—" : h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`);

// Everything the company has finished, and what it says about how the work
// goes. The list answers "what happened to this task"; the grouped views
// answer "how are we doing" — per person, team, client, kind of work or
// month, each with how long work takes and how often it comes back for
// revision. Whatever is on screen is what Export writes out.
export type TaskDetail = {
  drive: string | null;
  frameio: string | null;
  raw: string | null;
  reference: string | null;
  assets: string | null;
  notes: string | null;
  reviewNotes: string | null;
  internal: boolean;
  links: { label: string; url: string }[];
  createdBy: string | null;
};

export function HistoryExplorer({
  items: wire,
  details,
  logsByTask,
  canDelete,
}: {
  items: Wire[];
  details: Record<string, TaskDetail>;
  logsByTask: Record<string, { createdAt: string; action: string; actorName: string }[]>;
  canDelete: boolean;
}) {
  const items = useMemo<HistoryItem[]>(
    () =>
      wire.map((i) => ({
        ...i,
        createdAt: new Date(i.createdAt),
        startedAt: i.startedAt ? new Date(i.startedAt) : null,
        completedAt: new Date(i.completedAt),
        dueDate: i.dueDate ? new Date(i.dueDate) : null,
      })),
    [wire]
  );

  const [view, setView] = useState<"list" | GroupBy>("list");
  const [filters, setFilters] = useState<Filters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const shown = useMemo(() => filterHistory(items, filters), [items, filters]);
  const rows = useMemo(() => (view === "list" ? [] : summarize(shown, view)), [shown, view]);

  // the lists each filter offers, taken from the work itself
  const options = useMemo(() => {
    const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))].sort();
    return {
      people: [...new Map(items.map((i) => [i.personId, i.person])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
      teams: uniq(items.map((i) => i.team)),
      clients: uniq(items.map((i) => i.client)),
      tags: uniq(items.flatMap((i) => i.tags)),
    };
  }, [items]);

  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  // The export is the view: same filters, same grouping. The server builds
  // it because the detailed rows carry every stage's timings, which are
  // worked out from the activity log rather than held on the task.
  const exportHref = () => {
    const params = new URLSearchParams({ group: view });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
    return `/history/export?${params}`;
  };

  const open = items.find((i) => i.id === openId) ?? null;
  const openLogs = openId ? logsByTask[openId] ?? [] : [];
  const detail = openId ? details[openId] : undefined;
  // every file the task carries, whichever system it came from
  const fileLinks = [
    { label: "Final Drive", url: detail?.drive },
    { label: "Frame.io", url: detail?.frameio },
    { label: "Raw footage", url: detail?.raw },
    { label: "Reference", url: detail?.reference },
    { label: "Assets", url: detail?.assets },
    ...(detail?.links ?? []).map((l) => ({ label: l.label || "Link", url: l.url })),
  ].filter((l): l is { label: string; url: string } => !!l.url);

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        left={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5">
              <Search size={13} className="shrink-0 text-muted" />
              <input
                value={filters.search ?? ""}
                onChange={(e) => set({ search: e.target.value })}
                placeholder="Search finished work…"
                className="w-40 min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                activeFilters ? "border-hover bg-hover text-foreground" : "border-border bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              <Filter size={12} /> {activeFilters ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"}` : "Filter"}
            </button>
            {activeFilters > 0 && (
              <button type="button" onClick={() => setFilters({})} className="text-xs text-muted hover:text-foreground">
                Reset
              </button>
            )}
          </div>
        }
        center={
          <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-border bg-surface/60 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  view === v.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
        right={
          <a
            href={exportHref()}
            download
            title="A spreadsheet of exactly what's on screen — with each task's timings, revisions and full stage trail"
            className="btn-glow flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            <Download size={14} /> Export
          </a>
        }
      />

      {filtersOpen && (
        <div className="fade-in grid gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Person
            <Dropdown
              defaultValue={filters.personId ?? ""}
              placeholder="Anyone"
              options={[{ value: "", label: "Anyone" }, ...options.people.map(([id, name]) => ({ value: id, label: name }))]}
              onChange={(v) => set({ personId: v || undefined })}
              size="sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Team
            <Dropdown
              defaultValue={filters.team ?? ""}
              placeholder="Any team"
              options={[{ value: "", label: "Any team" }, ...options.teams.map((t) => ({ value: t, label: t }))]}
              onChange={(v) => set({ team: v || undefined })}
              size="sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Client
            <Dropdown
              defaultValue={filters.client ?? ""}
              placeholder="Any client"
              options={[{ value: "", label: "Any client" }, ...options.clients.map((c) => ({ value: c, label: c }))]}
              onChange={(v) => set({ client: v || undefined })}
              size="sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Type of work
            <Dropdown
              defaultValue={filters.tag ?? ""}
              placeholder="Any type"
              options={[{ value: "", label: "Any type" }, ...options.tags.map((t) => ({ value: t, label: t }))]}
              onChange={(v) => set({ tag: v || undefined })}
              size="sm"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted">
            Finished from
            <DatePicker value={filters.from ?? ""} onChange={(v) => set({ from: v || undefined })} placeholder="Any time" />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted">
            Finished to
            <DatePicker value={filters.to ?? ""} onChange={(v) => set({ to: v || undefined })} placeholder="Today" />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted sm:col-span-3 lg:col-span-2">
            Work
            <Dropdown
              defaultValue={filters.kind ?? ""}
              placeholder="Everything"
              options={[
                { value: "", label: "Everything" },
                { value: "client", label: "Client work" },
                { value: "internal", label: "Own work" },
              ]}
              onChange={(v) => set({ kind: (v || undefined) as Filters["kind"] })}
              size="sm"
            />
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">
          Nothing finished matches that.
        </p>
      ) : view === "list" ? (
        <div key="list" className="fade-in overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Type of work</th>
                <th className="px-3 py-2 font-medium">Turnaround</th>
                <th className="px-3 py-2 font-medium">Revisions</th>
                <th className="px-3 py-2 font-medium">Deliverable</th>
                {canDelete && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const link = details[i.id];
                const late = onTime(i) === false;
                return (
                  <tr
                    key={i.id}
                    onClick={() => {
                      setOpenId(i.id);
                      dialogRef.current?.showModal();
                    }}
                    className="cursor-pointer border-t border-border hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(i.completedAt)}</td>
                    <td className="px-3 py-2">
                      {i.title}
                      {i.kind === "internal" && <span className="ml-2 text-xs text-muted">own work</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{i.person}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{i.client ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {i.tags.map((t) => (
                          <TaskTagChip key={t} name={t} />
                        ))}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${late ? "text-red-300" : "text-muted"}`}>
                      {hoursLabel(turnaroundHours(i))}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted">{i.revisions || "—"}</td>
                    <td className="px-3 py-2">
                      {link?.drive || link?.frameio ? (
                        <a
                          href={(link.drive ?? link.frameio)!}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 underline underline-offset-2"
                        >
                          {link.drive ? "Drive" : "Frame.io"} ↗
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {canDelete && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {i.kind === "client" && (
                          <>
                            <form id={`delete-history-${i.id}`} action={deleteTaskPermanently}>
                              <input type="hidden" name="taskId" value={i.id} />
                            </form>
                            <ConfirmButton
                              message={`Permanently delete "${i.title}"? This removes it and its activity log from the database. It can't be undone.`}
                              className="text-xs text-muted hover:text-red-400"
                              formId={`delete-history-${i.id}`}
                            >
                              Delete
                            </ConfirmButton>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div key={view} className="fade-in overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{columnFor(view)}</th>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 font-medium">Per week</th>
                <th className="px-3 py-2 font-medium">Median turnaround</th>
                <th className="px-3 py-2 font-medium">Median working time</th>
                <th className="px-3 py-2 font-medium">Revisions / task</th>
                <th className="px-3 py-2 font-medium">On time</th>
                <th className="px-3 py-2 font-medium">Last finished</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-2">{r.key}</td>
                  <td className="px-3 py-2 tabular-nums">{r.completed}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{r.perWeek}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{hoursLabel(r.medianTurnaround)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{hoursLabel(r.medianActive)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{r.revisionsPerTask}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{r.onTimePct === null ? "—" : `${r.onTimePct}%`}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(r.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 text-foreground"
      >
        {open && (
          <>
            <h2 className="text-base font-semibold">{open.title}</h2>
            <p className="text-xs text-muted">
              {[open.client, open.project].filter(Boolean).join(" · ") || "Own work"} · {open.person}
              {open.team && ` · ${open.team}`}
            </p>

            {(open.tags.length > 0 || detail?.internal || open.kind === "internal") && (
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {open.kind === "internal" && <TaskTagChip name="Own work" />}
                {detail?.internal && <TaskTagChip name="Internal — not delivered to the client" />}
                {open.tags.map((t) => (
                  <TaskTagChip key={t} name={t} />
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Created", formatDate(open.createdAt)],
                ["Started", open.startedAt ? formatDate(open.startedAt) : "—"],
                ["Finished", formatDate(open.completedAt)],
                ["Due", open.dueDate ? formatDate(open.dueDate) : "—"],
                ["Turnaround", hoursLabel(turnaroundHours(open))],
                ["Working time", hoursLabel(activeHours(open))],
                ["Revisions", String(open.revisions)],
                ["On time", onTime(open) === null ? "—" : onTime(open) ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="tabular-nums">{value}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>

            {fileLinks.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-muted">Files</p>
                <div className="flex flex-wrap gap-2">
                  {fileLinks.map((l) => (
                    <a
                      key={l.label + l.url}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                    >
                      {l.label} <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {detail?.notes && (
              <div className="mt-5">
                <p className="mb-1 text-xs font-medium text-muted">Brief</p>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">{detail.notes}</p>
              </div>
            )}

            {detail?.reviewNotes && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted">Last revision note</p>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">{detail.reviewNotes}</p>
              </div>
            )}

            {detail?.createdBy && <p className="mt-4 text-xs text-muted">Added by {detail.createdBy}</p>}
            {openLogs.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-muted">Every stage it went through</p>
                <ol className="flex flex-col gap-2">
                  {openLogs.map((l, idx) => {
                    const [from, to] = l.action.split(" → ");
                    return (
                      <li key={idx} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0">
                        <span>
                          {to ? (
                            <>
                              {stageName(from)} <span className="text-muted">→</span> {stageName(to)}
                            </>
                          ) : l.action === "created" ? (
                            "Created"
                          ) : (
                            l.action
                          )}
                        </span>
                        <span className="text-xs text-muted">
                          {l.actorName} · {formatDateTime(l.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-lg px-4 py-2 text-sm">
                Close
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
