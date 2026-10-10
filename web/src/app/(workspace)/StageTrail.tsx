"use client";

import { Plus } from "lucide-react";
import type { TaskStatus } from "@/lib/workflow";
import { STAGE, parseStageChange } from "@/lib/stages";
import { Avatar } from "./TaskCard";

export type TrailEntry = { createdAt: Date | string; action: string; actorName: string };

const stageName = (s: string) => STAGE[s as TaskStatus]?.label ?? s;

// India's day and time, which is what everyone here reads
const dayOf = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase();

// The stages a task went through, as a timeline, oldest first: the days as
// quiet headings, and for each move a node in the new stage's colour on a
// connecting line, the stage it reached as a pill, then where it came from,
// who moved it and when.
//
// Shared by the board's task window and History's, because it's the same
// question in both places.
export function StageTrail({ logs }: { logs: TrailEntry[] | null }) {
  if (logs === null) return <p className="text-xs text-muted">Loading…</p>;
  if (logs.length === 0) return <p className="text-xs text-muted">No activity recorded yet.</p>;

  const days = logs.map((l) => dayOf(new Date(l.createdAt)));
  return (
    <ol className="flex flex-col">
      {logs.map((log, i) => {
        const at = new Date(log.createdAt);
        const day = days[i];
        const newDay = i === 0 || day !== days[i - 1];
        const change = parseStageChange(log.action);
        const stage = change ? STAGE[change.to as TaskStatus] : undefined;
        const last = i === logs.length - 1;
        // a stage Notion set is Notion's, not the person who pressed sync
        const who = change?.fromNotion ? "Notion" : log.actorName;

        return (
          <li key={i}>
            {newDay && (
              <p className={`pb-2 text-[11px] font-medium uppercase tracking-wider text-muted/70 ${i > 0 ? "pt-3" : ""}`}>{day}</p>
            )}
            <div className="relative flex gap-3 pb-4">
              {/* the line on to the next move */}
              {!last && <span className="absolute bottom-0 left-[9px] top-6 w-px bg-gradient-to-b from-white/15 to-white/[0.04]" />}
              <span
                className={`relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border ${
                  stage ? `${stage.pill}` : "border-white/15 bg-white/[0.04] text-muted"
                }`}
              >
                {stage ? <span className={`size-1.5 rounded-full ${stage.dot}`} /> : <Plus size={11} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm leading-5">
                    {change ? (
                      <span className={`inline-flex rounded-full border px-2 py-px text-xs font-medium ${stage?.pill ?? ""}`}>{stageName(change.to)}</span>
                    ) : log.action === "created" ? (
                      "Created"
                    ) : (
                      log.action
                    )}
                  </p>
                  <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted" title={`${day}, ${timeOf(at)} IST`}>
                    {timeOf(at)}
                  </span>
                </div>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  {change && <span className="shrink-0">from {stageName(change.from)} ·</span>}
                  {!change?.fromNotion && <Avatar name={log.actorName} size={16} presence={false} />}
                  <span className="truncate">{who}</span>
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
