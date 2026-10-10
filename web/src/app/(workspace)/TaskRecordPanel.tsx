"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Layers, Plus, UserPlus } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { Avatar } from "./TaskCard";
import { addPeopleToTask, getTaskRecord, setTaskDepartment } from "./taskRecord";
import type { TaskRef } from "@/lib/taskTrack";
import { dayOf, shortDay } from "@/lib/editorKpi";

type Loaded = NonNullable<Awaited<ReturnType<typeof getTaskRecord>>>;

// "Riya", "Riya and Ishaan", "Riya, Ishaan and Ashmit"
const names = (all: string[]) => (all.length < 2 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`);
const day = (iso: string | Date | null) => (iso ? shortDay(dayOf(new Date(iso))) : "No date");

// faces, overlapping
function Faces({ people, size = 18 }: { people: string[]; size?: number }) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.map((name) => (
        <span key={name} className="rounded-full ring-2 ring-surface">
          <Avatar name={name} size={size} presence={false} />
        </span>
      ))}
    </span>
  );
}

// A task's record, in its window: when it was made and by whom, and the
// department it's filed under; then, in one line, who else is on it, when
// it's due and how many due dates it has missed. What happened opens from
// that line, as a plain list in order. Loaded when the window opens.
export function TaskRecordPanel({ task, createdAt, open }: { task: TaskRef; createdAt: string | Date; open: boolean }) {
  const router = useRouter();
  const [record, setRecord] = useState<Loaded | null>(null);
  const [details, setDetails] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // by its kind and id: the ref itself is a fresh object every render
  const { kind, id } = task;
  const load = useCallback(() => getTaskRecord({ kind, id }).then(setRecord), [kind, id]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getTaskRecord({ kind, id }).then((r) => live && setRecord(r));
    return () => {
      live = false;
    };
  }, [open, kind, id]);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await addPeopleToTask(task, picked, reason);
    setBusy(false);
    if (res.error) return setError(res.error);
    setAdding(false);
    setPicked([]);
    setReason("");
    load();
    router.refresh();
  }

  if (!record) return null;
  const hasPeople = record.people.length > 0;
  const hasDates = record.dates.length > 0 || record.strikes > 0;

  // every date it has had: the first, then each it was changed to
  const dates = [record.dates[0]?.from ?? record.due, ...record.dates.map((d) => d.to)];
  // whether it went past date i, and which miss that was: the strikes rose
  // between being given that date and being changed off it (or now)
  const missOf = (i: number) => {
    const after = i < record.dates.length ? record.dates[i].strike : record.strikes;
    const before = i === 0 ? 0 : record.dates[i - 1].strike;
    return after > before ? after : 0;
  };
  const first = (name: string) => name.split(" ")[0];
  // what happened, in order: the first due date, each miss (and who was
  // told), each change of date and each person added, with their reasons
  type Event = { at: string; tone: "plain" | "miss" | "change" | "add"; text: string; note?: string; told?: string[] };
  const events: Event[] = [
    ...(hasDates && dates[0] ? [{ at: new Date(createdAt).toISOString(), tone: "plain" as const, text: `Due date set to ${day(dates[0])}${record.createdBy ? ` by ${first(record.createdBy)}` : ""}` }] : []),
    ...dates.flatMap((d, i) => {
      const n = missOf(i);
      // counted the morning after
      return n && d ? [{ at: new Date(new Date(d).getTime() + 27 * 3_600_000).toISOString(), tone: "miss" as const, text: `Not finished by the ${day(d)} due date`, told: record.misses[n - 1]?.told ?? [] }] : [];
    }),
    ...record.dates.map((d) => ({ at: d.at, tone: "change" as const, text: `${first(d.by)} changed the due date to ${day(d.to)}`, note: d.reason })),
    ...record.people.map((p) => ({ at: p.at, tone: "add" as const, text: `${first(p.by)} added ${first(p.name)}`, note: p.reason })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const DOT = { plain: "bg-white/40", miss: "bg-rose-400", change: "bg-amber-300", add: "bg-emerald-400" };

  return (
    <div className="col-span-2 flex flex-col gap-3 rounded-xl border border-border/70 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Created {day(createdAt)}
          {record.createdBy && <> by {record.createdBy}</>}
        </span>
        <div className="flex items-center gap-2">
          {!adding && record.canAdd.length > 0 && (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground">
              <UserPlus size={13} /> Add people
            </button>
          )}
          <Dropdown
            size="sm"
            pill={{ icon: <Layers size={12} className="text-sky-400" /> }}
            value={record.teamId ?? ""}
            placeholder="Department"
            onChange={async (teamId) => {
              setRecord((r) => r && { ...r, teamId });
              const res = await setTaskDepartment(task, teamId);
              if (res.error) setError(res.error);
              else router.refresh();
            }}
            options={record.departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      </div>

      {adding && (
        <div className="fade-in flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3">
          <div className="flex flex-wrap gap-1.5">
            {record.canAdd.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((all) => (on ? all.filter((x) => x !== p.id) : [...all, p.id]))}
                  className="chip flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs"
                >
                  <Avatar name={p.name} size={18} presence={false} />
                  {p.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why are you adding them? They'll see this."
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-hover"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={add} disabled={busy || !picked.length || !reason.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
              <Plus size={13} /> {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* the gist in one line; the why opens from it */}
      {(hasPeople || hasDates) && (
        <div>
        <button
          type="button"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white/[0.03] px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06]"
        >
          {hasPeople && (
            <span className="flex min-w-0 items-center gap-2">
              <Faces people={record.people.map((p) => p.name)} />
              <span className="truncate text-foreground/80">Also on it: {names(record.people.map((p) => first(p.name)))}</span>
            </span>
          )}
          {hasDates && (
            <span className="text-muted">
              Due <span className="text-foreground/85">{day(record.due)}</span>
              {record.strikes > 0 && (
                <span className="text-rose-300">
                  {" "}
                  · Late {record.strikes} {record.strikes === 1 ? "time" : "times"}
                </span>
              )}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-muted">
            {details ? "Hide" : "Details"}
            <ChevronDown size={13} className={`transition-transform duration-300 ${details ? "rotate-180" : ""}`} />
          </span>
        </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${details ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden pt-3" inert={!details}>
          <ol>
            {events.map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* the line down to the next thing that happened */}
                {i < events.length - 1 && <span className="absolute top-4 bottom-0 left-[4px] w-px bg-white/10" />}
                <span className={`relative mt-[5px] size-2.5 shrink-0 rounded-full ${DOT[e.tone]}`} />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className={e.tone === "miss" ? "text-rose-300" : "text-foreground/90"}>{e.text}</span>
                    <span className="shrink-0 text-[12px] text-muted tabular-nums">{day(e.at)}</span>
                  </p>
                  {e.note && <p className="mt-0.5 leading-relaxed text-muted">&ldquo;{e.note}&rdquo;</p>}
                  {e.told && e.told.length > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-muted" title={names(e.told)}>
                      <Faces people={e.told} size={16} />
                      {names(e.told.map(first))} {e.told.length === 1 ? "was" : "were"} notified
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
