"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Layers, Plus, UserPlus } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { Avatar } from "./TaskCard";
import { addPeopleToTask, getTaskRecord, setTaskDepartment } from "./taskRecord";
import type { TaskRef } from "@/lib/taskTrack";
import { ordinal } from "@/lib/overdue";

type Loaded = NonNullable<Awaited<ReturnType<typeof getTaskRecord>>>;

const day = (iso: string | Date | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "no date";

// A task's record, in its window: when it was made and by whom, the
// department it's filed under, everyone brought onto it and why, and every
// move of its completion date with its reason. Loaded when the window opens.
export function TaskRecordPanel({ task, createdAt, open }: { task: TaskRef; createdAt: string | Date; open: boolean }) {
  const router = useRouter();
  const [record, setRecord] = useState<Loaded | null>(null);
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

  return (
    <div className="col-span-2 flex flex-col gap-4 rounded-xl border border-border/70 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Created {day(createdAt)}
          {record.createdBy && <> by {record.createdBy}</>}
          {record.strikes > 0 && <span className="ml-2 text-rose-300">· past its date {record.strikes === 1 ? "once" : `${record.strikes} times`}</span>}
        </span>
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

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className={label}>People on it</p>
          {!adding && record.canAdd.length > 0 && (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
              <UserPlus size={13} /> Add people
            </button>
          )}
        </div>
        {record.people.length === 0 && !adding && <p className="text-xs text-muted/70">Only whoever it&apos;s assigned to.</p>}
        {record.people.map((p) => (
          <div key={p.id} className="flex items-start gap-2.5">
            <Avatar name={p.name} size={22} presence={false} />
            <p className="min-w-0 text-xs leading-relaxed">
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="text-muted">, added by {p.by} on {day(p.at)}: </span>
              <span className="text-foreground/85">{p.reason}</span>
            </p>
          </div>
        ))}
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
      </div>

      {record.dates.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={label}>Completion date moves</p>
          {record.dates.map((d, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs">
              <CalendarClock size={13} className={`mt-0.5 shrink-0 ${d.strike ? "text-rose-300" : "text-muted"}`} />
              <p className="min-w-0 leading-relaxed">
                <span className="text-foreground">
                  {day(d.from)} → {day(d.to)}
                </span>
                <span className="text-muted">
                  {" "}
                  by {d.by}
                  {d.strike > 0 && <span className="text-rose-300"> after its {ordinal(d.strike)} miss</span>}:{" "}
                </span>
                <span className="text-foreground/85">{d.reason}</span>
              </p>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
