"use client";

import { useEffect, useState } from "react";
import { List, LayoutGrid, PartyPopper, X } from "lucide-react";
import { Board } from "./Board";
import { EditorTaskList } from "./EditorTaskList";
import type { TaskCardData } from "./TaskCard";
import type { Role } from "@/lib/workflow";

type Mode = "list" | "board";
const STORAGE_KEY = "editor-view-mode";

// short synthesized chime (no audio asset to host/license) — a quick
// upward two-note ding. Browsers block audio with no prior user gesture
// on the page; since editors click around the board before an approval
// notification would ever fire, this is normally already unlocked.
function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.1;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // ignore — unsupported browser, or autoplay still locked
  }
}

// Same task data, two layouts — editors get the same board the ops team
// uses (read/act on their own cards only), or the simpler list view.
export function EditorViewToggle(props: {
  tasks: TaskCardData[];
  projects: { id: string; client: { name: string } }[];
  editors: { id: string; name: string }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [celebration, setCelebration] = useState<string | null>(null);
  // per-user, in localStorage rather than a plain ref — an in-memory ref
  // only survives while the tab stays open, so an approval that happened
  // while the editor's tab was closed (or before their first-ever visit)
  // would never be "before vs after" comparable. Persisting the last-seen
  // status per task means even a fresh page load can still catch it.
  const seenKey = `approval-seen:${props.actingUserId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "list" || stored === "board") setMode(stored);
    } catch {
      // ignore
    }
  }, []);

  // LiveRefresh polls every 5s (and this also runs on first mount) — catch
  // ops approving one of this editor's tasks (sent_for_approval ->
  // final_export_ready) and say so, since otherwise the only sign is the
  // card quietly changing column
  useEffect(() => {
    let prev: Record<string, string> | null = null;
    try {
      const raw = localStorage.getItem(seenKey);
      prev = raw ? JSON.parse(raw) : null;
    } catch {
      prev = null;
    }

    if (prev) {
      // ops has full manual override on the queue (see workflow.ts), so an
      // approval doesn't always arrive via sent_for_approval specifically —
      // any move INTO final_export_ready from something that wasn't already
      // there counts
      const approved = props.tasks.filter(
        (t) => t.status === "final_export_ready" && prev![t.id] && prev![t.id] !== "final_export_ready"
      );
      if (approved.length === 1) {
        setCelebration(`"${approved[0].title}" was approved — nice work!`);
        playChime();
      } else if (approved.length > 1) {
        setCelebration(`${approved.length} of your tasks were approved — nice work!`);
        playChime();
      }
    }

    try {
      const next: Record<string, string> = {};
      for (const t of props.tasks) next[t.id] = t.status;
      localStorage.setItem(seenKey, JSON.stringify(next));
    } catch {
      // ignore — worst case, a fresh localStorage means we just re-bootstrap silently
    }
  }, [props.tasks, seenKey]);

  function pick(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {([
          { value: "list" as const, label: "List", Icon: List },
          { value: "board" as const, label: "Board", Icon: LayoutGrid },
        ]).map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => pick(value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              mode === value ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {mode === "list" ? (
        <EditorTaskList tasks={props.tasks} actingUserId={props.actingUserId} actingRole={props.actingRole} />
      ) : (
        <Board
          tasks={props.tasks}
          projects={props.projects}
          editors={props.editors}
          actingUserId={props.actingUserId}
          actingRole={props.actingRole}
          canCreate={false}
        />
      )}

      {celebration && (
        <div className="glass fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 pr-3 shadow-2xl">
          <PartyPopper size={18} className="shrink-0 text-emerald-300" />
          <p className="text-sm">{celebration}</p>
          <button
            type="button"
            onClick={() => setCelebration(null)}
            aria-label="Dismiss"
            className="btn-ghost -mr-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
