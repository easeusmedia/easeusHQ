"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, PenLine, Pencil, Plus, Send, Undo2, UserRound, type LucideIcon } from "lucide-react";
import { Reveal } from "../../Reveal";
import { formatDateTime } from "../../TaskCard";
import { dateOf } from "./values";
import type { LeadEventData } from "@/lib/space";

const KIND: Record<string, { icon: LucideIcon; tone: string }> = {
  created: { icon: Plus, tone: "bg-emerald-400/10 text-emerald-300" },
  moved: { icon: ArrowRight, tone: "bg-accent/10 text-accent" },
  assigned: { icon: UserRound, tone: "bg-sky-400/10 text-sky-300" },
  renamed: { icon: Pencil, tone: "bg-white/[0.05] text-muted" },
  edited: { icon: PenLine, tone: "bg-white/[0.05] text-muted" },
  restored: { icon: Undo2, tone: "bg-emerald-400/10 text-emerald-300" },
  sent: { icon: Send, tone: "bg-accent/10 text-accent" },
};

const first = (name: string) => name.split(" ")[0];
// "1 Oct, 3:40 PM IST"
const at = (iso: string) => `${dateOf(iso)}, ${formatDateTime(iso).split(", ")[1]}`;

// Stage colours aren't kept on the record, so these are plain
function Stage({ name }: { name: string }) {
  return <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/[0.04] px-2 text-[11px] leading-5 text-muted">{name}</span>;
}

// A lead's record, like a task's: the gist in one line, and what happened
// opening from it, in order (or just what happened, when `flat`, as in the
// lead window's side panel). Events come newest first.
export function LeadHistory({ events, flat = false }: { events: LeadEventData[]; flat?: boolean }) {
  const [opened, setOpen] = useState(false);
  const open = flat || opened;
  if (!events.length) return <p className="px-1 text-xs text-muted">Nothing recorded yet.</p>;

  const created = events.find((e) => e.kind === "created");
  const moves = events.filter((e) => e.kind === "moved");
  const asked = moves.filter((e) => e.reason).length;
  const gist = [
    created && `Created by ${first(created.byName)} on ${dateOf(created.createdAt)}`,
    moves.length ? `moved ${moves.length} ${moves.length === 1 ? "time" : "times"}` : "not moved yet",
    asked > 0 && `${asked} needed a reason`,
  ]
    .filter(Boolean)
    .join(" · ");
  const list = [...events].reverse();

  return (
    <div>
      {!flat && (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06]"
      >
        <span className="min-w-0 flex-1 text-foreground/80">{gist[0].toUpperCase() + gist.slice(1)}</span>
        <span className="flex shrink-0 items-center gap-1 text-muted">
          {open ? "Hide" : "What happened"}
          <ChevronDown size={13} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      )}
      <Reveal open={open}>
        <ol className={flat ? "" : "px-1 pt-4"}>
          {list.map((e, i) => {
            const { icon: Icon, tone } = KIND[e.kind] ?? KIND.edited;
            return (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* the line down to the next thing that happened */}
                {i < list.length - 1 && <span className="absolute top-7 bottom-1 left-[11px] w-px bg-white/10" />}
                <span className={`relative flex size-6 shrink-0 items-center justify-center rounded-full ${tone}`}>
                  <Icon size={12} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5 text-xs">
                  {e.kind === "moved" && e.fromStage && e.toStage ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-foreground/90">
                      <Stage name={e.fromStage} />
                      <ArrowRight size={11} className="shrink-0 text-muted" />
                      <Stage name={e.toStage} />
                    </p>
                  ) : (
                    <p className="break-words text-foreground/90">{e.summary}</p>
                  )}
                  {e.reason && (
                    <p className="mt-1.5 border-l-2 border-white/15 pl-2 leading-relaxed break-words text-foreground/80">&ldquo;{e.reason}&rdquo;</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted">
                    By {e.byName} · {at(e.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Reveal>
    </div>
  );
}
