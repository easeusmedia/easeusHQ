"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { restoreDeleted } from "../taskRecord";

export type DeletedRow = { id: string; title: string; client: string | null; assignee: string | null; by: string; reason: string; at: string };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// Every task that was deleted, with who deleted it, when and why: nothing
// goes missing from the record. Level 1 can bring one back.
export function DeletedRecord({ rows, canRestore }: { rows: DeletedRow[]; canRestore: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!rows.length) return null;
  return (
    <section className="mt-8 flex flex-col gap-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 self-start text-sm text-muted transition-colors hover:text-foreground">
        <Trash2 size={14} />
        Deleted tasks <span className="tabular-nums">{rows.length}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="fade-in flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {r.title}
                  <span className="text-muted">
                    {" "}
                    · {r.client ?? "Admin tasks"}
                    {r.assignee && ` · ${r.assignee}`}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Deleted by {r.by} on {when(r.at)}: <span className="text-foreground/85">{r.reason}</span>
                </p>
              </div>
              {canRestore && (
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    const res = await restoreDeleted(r.id);
                    if (res.error) setError(res.error);
                    else router.refresh();
                  }}
                  className="btn btn-xs btn-ghost flex shrink-0 items-center gap-1"
                >
                  <RotateCcw size={12} /> Restore
                </button>
              )}
            </div>
          ))}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
