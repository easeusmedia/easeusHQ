"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Layers, Plus, UserPlus } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { Avatar } from "./TaskCard";
import { addPeopleToTask, getTaskRecord, setTaskDepartment } from "./taskRecord";
import type { TaskRef } from "@/lib/taskTrack";
import { ordinal } from "@/lib/overdue";
import { dayOf, shortDay } from "@/lib/editorKpi";

type Loaded = NonNullable<Awaited<ReturnType<typeof getTaskRecord>>>;

// "Riya", "Riya and Ishaan", "Riya, Ishaan and Ashmit"
const names = (all: string[]) => (all.length < 2 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`);
// "once", "twice", "3 times"
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const day = (iso: string | Date | null) => (iso ? shortDay(dayOf(new Date(iso))) : "No date");
// "29 Sep, 3:41 pm", in IST
const moment = (iso: string) => `${day(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`;

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

// a person on a branch of the tree: the line runs down the left and curves
// into their face (the client tree's line, in the sidebar)
function Branch({ last, name, meta, children }: { last: boolean; name: string; meta: string; children: React.ReactNode }) {
  return (
    <li className="relative pb-3 last:pb-0">
      <span className="absolute top-0 left-[11px] h-[15px] w-3.5 rounded-bl-lg border-b border-l border-white/15" />
      {!last && <span className="absolute top-[15px] bottom-0 left-[11px] w-px bg-white/15" />}
      <div className="flex items-start gap-2.5 pl-7">
        <Avatar name={name} size={22} presence={false} />
        <div className="min-w-0 pt-px text-xs leading-relaxed">
          <p>
            <span className="font-medium text-foreground">{name}</span>
            <span className="text-muted"> · {meta}</span>
          </p>
          <p className="text-foreground/80">{children}</p>
        </div>
      </div>
    </li>
  );
}

// A task's record, in its window: when it was made and by whom, and the
// department it's filed under; then, in one line, who else is on it and
// how its due date has gone. The why of each (reasons, every date, who was
// told of each miss) opens from that line. Loaded when the window opens.
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
  const label = "text-[11px] font-medium tracking-wide text-muted uppercase";
  const hasPeople = record.people.length > 0;
  const hasDates = record.dates.length > 0 || record.strikes > 0;

  // every date it has had: the first, then each it was moved to (and how)
  const nodes = [{ date: record.dates[0]?.from ?? record.due, move: null }, ...record.dates.map((d) => ({ date: d.to, move: d }))];
  // whether it went past date i, and which miss that was: the strikes rose
  // between being given that date and being moved off it (or now)
  const missOf = (i: number) => {
    const after = i < record.dates.length ? record.dates[i].strike : record.strikes;
    const before = i === 0 ? 0 : record.dates[i - 1].strike;
    return after > before ? after : 0;
  };

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
                  className={`flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs transition-colors ${on ? "border-accent/40 bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"}`}
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
              <span className="truncate text-foreground/80">With {names(record.people.map((p) => p.name.split(" ")[0]))}</span>
            </span>
          )}
          {hasDates && (
            <span className="text-muted">
              Due <span className="text-foreground/85">{day(record.due)}</span>
              {record.dates.length > 0 && <> · moved {times(record.dates.length)}</>}
              {record.strikes > 0 && <span className="text-rose-300"> · missed {times(record.strikes)}</span>}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-muted">
            {details ? "Hide" : "Details"}
            <ChevronDown size={13} className={`transition-transform duration-300 ${details ? "rotate-180" : ""}`} />
          </span>
        </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${details ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden pt-3" inert={!details}>
          {hasPeople && (
            <div className="flex flex-col gap-2 pt-1">
              <p className={label}>People on it</p>
              <ul>
                {record.people.map((p, i) => (
                  <Branch key={p.id} last={i === record.people.length - 1} name={p.name} meta={`added by ${p.by}, ${moment(p.at)}`}>
                    {p.reason}
                  </Branch>
                ))}
              </ul>
            </div>
          )}

          {hasDates && (
            <div className="flex flex-col gap-2 pt-1">
              <p className={label}>Task due</p>
              <ol>
                {nodes.map((n, i) => {
                  const first = i === 0 && nodes.length > 1;
                  const latest = i === nodes.length - 1;
                  const missed = missOf(i);
                  const told = record.misses[missed - 1]?.told ?? [];
                  return (
                    <li key={i} className={`relative ${i ? "pt-2" : ""}`}>
                      {/* the line from the date before, and on to the next */}
                      {i > 0 && <span className="absolute top-0 left-[11px] h-[15px] w-px bg-white/15" />}
                      {!latest && <span className={`absolute ${i ? "top-[25px]" : "top-[17px]"} bottom-0 left-[11px] w-px bg-white/15`} />}
                      <div className="flex h-6 items-center gap-2 pl-7">
                        <span
                          className={`absolute ${i ? "top-[15px]" : "top-[7px]"} left-[6px] size-2.5 rounded-full ${
                            first ? "border border-white/25" : latest ? (missed ? "bg-rose-400 shadow-[0_0_0_3px_rgb(251_113_133/0.2)]" : "bg-accent shadow-[0_0_0_3px_rgb(75_149_230/0.2)]") : "bg-white/35"
                          }`}
                        />
                        {first ? (
                          <>
                            <span className="text-xs text-muted line-through decoration-white/25">{day(n.date)}</span>
                            <span className="text-[11px] text-muted/60">first date</span>
                          </>
                        ) : (
                          <span className={`text-sm font-medium tabular-nums ${latest ? "text-foreground" : "text-foreground/70"}`}>{day(n.date)}</span>
                        )}
                      </div>
                      {n.move && (
                        <ul className="relative mt-1 ml-[22px]">
                          <Branch last name={n.move.by} meta={moment(n.move.at)}>
                            {n.move.reason}
                          </Branch>
                        </ul>
                      )}
                      {/* it went past this date: who was told */}
                      {missed > 0 && (
                        <div className="mt-1.5 ml-7 flex items-center gap-2 pb-1 text-xs">
                          <Faces people={told} />
                          <span className="text-rose-300">
                            Missed{missed > 1 ? `, the ${ordinal(missed)} time` : ""}. {names(told)} {told.length === 1 ? "was" : "were"} told.
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
