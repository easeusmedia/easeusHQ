"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, UserPlus } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { Avatar } from "./TaskCard";
import {
  addPeopleToTask,
  getTaskRecord,
  setTaskDepartment,
} from "./taskRecord";
import type { TaskRef } from "@/lib/taskTrack";
import { ordinal } from "@/lib/overdue";
import { dayOf, shortDay } from "@/lib/editorKpi";

type Loaded = NonNullable<Awaited<ReturnType<typeof getTaskRecord>>>;

const day = (iso: string | Date | null) =>
  iso ? shortDay(dayOf(new Date(iso))) : "No date";
// "29 Sep, 3:41 pm", in IST
const moment = (iso: string) =>
  `${day(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`;

// a person on a branch of the tree: the line runs down the left and curves
// into their face (the client tree's line, in the sidebar)
function Branch({
  last,
  name,
  meta,
  children,
}: {
  last: boolean;
  name: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pb-3 last:pb-0">
      <span className="absolute top-0 left-[11px] h-[15px] w-3.5 rounded-bl-lg border-b border-l border-white/15" />
      {!last && (
        <span className="absolute top-[15px] bottom-0 left-[11px] w-px bg-white/15" />
      )}
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

// A task's record, in its window: when it was made and by whom, the
// department it's filed under, everyone brought onto it and why, and every
// move of its completion date with its reason. Loaded when the window opens.
export function TaskRecordPanel({
  task,
  createdAt,
  open,
}: {
  task: TaskRef;
  createdAt: string | Date;
  open: boolean;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<Loaded | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // by its kind and id: the ref itself is a fresh object every render
  const { kind, id } = task;
  const load = useCallback(
    () => getTaskRecord({ kind, id }).then(setRecord),
    [kind, id],
  );
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

  return (
    <div className="col-span-2 flex flex-col gap-4 rounded-xl border border-border/70 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Created {day(createdAt)}
          {record.createdBy && <> by {record.createdBy}</>}
          {record.strikes > 0 && (
            <span className="ml-2 text-rose-300">
              · past its due date{" "}
              {record.strikes === 1 ? "once" : `${record.strikes} times`}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!adding && record.canAdd.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
            >
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
            options={record.departments.map((d) => ({
              value: d.id,
              label: d.name,
            }))}
          />
        </div>
      </div>

      {/* only when someone else is on it, or being added */}
      {(record.people.length > 0 || adding) && (
        <div className="flex flex-col gap-2">
          {record.people.length > 0 && <p className={label}>People on it</p>}
          {record.people.length > 0 && (
            <ul>
              {record.people.map((p, i) => (
                <Branch
                  key={p.id}
                  last={i === record.people.length - 1}
                  name={p.name}
                  meta={`added by ${p.by}, ${moment(p.at)}`}
                >
                  {p.reason}
                </Branch>
              ))}
            </ul>
          )}
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
                      onClick={() =>
                        setPicked((all) =>
                          on ? all.filter((x) => x !== p.id) : [...all, p.id],
                        )
                      }
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
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={add}
                  disabled={busy || !picked.length || !reason.trim()}
                  className="btn btn-sm btn-glow disabled:opacity-50"
                >
                  <Plus size={13} /> {busy ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {record.dates.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={label}>Task due</p>
          <ol>
            {/* where it started */}
            <li className="relative flex h-6 items-center pl-7">
              <span className="absolute top-[7px] left-[6px] size-2.5 rounded-full border border-white/25" />
              <span className="absolute top-[17px] bottom-0 left-[11px] w-px bg-white/15" />
              <span className="text-xs text-muted line-through decoration-white/25">
                {day(record.dates[0].from)}
              </span>
              <span className="ml-2 text-[11px] text-muted/60">first date</span>
            </li>
            {record.dates.map((d, i) => {
              const latest = i === record.dates.length - 1;
              return (
                <li key={i} className="relative pt-2">
                  {/* the line from the date before, and on to the next */}
                  <span className="absolute top-0 left-[11px] h-[15px] w-px bg-white/15" />
                  {!latest && (
                    <span className="absolute top-[25px] bottom-0 left-[11px] w-px bg-white/15" />
                  )}
                  <div className="flex h-6 items-center gap-2 pl-7">
                    <span
                      className={`absolute top-[15px] left-[6px] size-2.5 rounded-full ${latest ? "bg-accent shadow-[0_0_0_3px_rgb(75_149_230/0.2)]" : "bg-white/35"}`}
                    />
                    <span
                      className={`text-sm font-medium tabular-nums ${latest ? "text-foreground" : "text-foreground/70"}`}
                    >
                      {day(d.to)}
                    </span>
                    {d.strike > 0 && (
                      <span className="rounded-full bg-rose-400/10 px-1.5 py-px text-[10px] font-medium text-rose-300">
                        after its {ordinal(d.strike)} miss
                      </span>
                    )}
                  </div>
                  <ul className="relative mt-1 ml-[22px] pb-1">
                    <Branch last name={d.by} meta={moment(d.at)}>
                      {d.reason}
                    </Branch>
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
