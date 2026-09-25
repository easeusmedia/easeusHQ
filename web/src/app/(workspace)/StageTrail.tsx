"use client";

import type { TaskStatus } from "@/lib/workflow";
import { STAGE, parseStageChange } from "@/lib/stages";
import { formatDateTime } from "./TaskCard";

export type TrailEntry = { createdAt: Date | string; action: string; actorName: string };

const stageName = (s: string) => STAGE[s as TaskStatus]?.label ?? s;

// The trail a task went through, as a timeline: a dot in that stage's own
// colour on a connecting line, what changed in words ("Editing → Sent for
// approval", not the stored keys), then who and when underneath. Newest last.
// One column that wraps, so nothing is cut off at a panel's edge.
//
// Shared by the board's task dialog and History's, because it's the same
// question in both places and it read as a bare list in one of them.
export function StageTrail({ logs }: { logs: TrailEntry[] | null }) {
  if (logs === null) return <p className="text-xs text-muted">Loading…</p>;
  if (logs.length === 0) return <p className="text-xs text-muted">No recorded activity.</p>;
  return (
    <ol>
      {logs.map((log, i) => {
        const change = parseStageChange(log.action);
        return (
          <li key={i} className="relative border-l border-border pb-4 pl-4 last:border-transparent last:pb-0">
            <span
              className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ring-2 ring-background ${
                change ? (STAGE[change.to as TaskStatus]?.dot ?? "bg-neutral-400") : "bg-neutral-400"
              }`}
            />
            <p className="text-sm leading-snug">
              {change ? (
                <>
                  {stageName(change.from)} <span className="text-muted">→</span> {stageName(change.to)}
                </>
              ) : log.action === "created" ? (
                "Created"
              ) : (
                log.action
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {/* a stage Notion set is Notion's, not the person who pressed
                  sync — saying "Abhishek" for it would be a lie in the log */}
              {change?.fromNotion ? "From Notion" : log.actorName} · {formatDateTime(log.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
