"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow } from "lucide-react";
import { PLAN_DAYS, type PlanItem } from "@/lib/contentPlan";
import { saveContentPlan } from "./actions";
import { Stepper } from "../Stepper";
import { closeOnBackdrop } from "../dialog";

// The blueprint: what one new project of this client gets, and across which
// days of its week each is made — fitted to each project's own deadline.
export function BlueprintButton({ clientId, plan }: { clientId: string; plan: PlanItem[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (type: string, patch: Partial<PlanItem>) =>
    setDraft((d) => d.map((p) => (p.type === type ? { ...p, ...patch } : p)));
  const total = draft.reduce((n, p) => n + p.count, 0);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveContentPlan(clientId, draft);
    setSaving(false);
    if (res.error) return setError(res.error);
    ref.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(plan);
          setError(null);
          ref.current?.showModal();
        }}
        className="btn btn-sm btn-ghost"
      >
        <Workflow size={14} /> Blueprint
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="text-base font-semibold">Blueprint</h2>
        <p className="mt-1 text-sm text-muted">
          The tasks every new project begins with, and when each one falls across a {PLAN_DAYS}-day project. Projects with a different deadline keep the same shape, scaled to fit.
        </p>

        <div className="mt-5 flex flex-col divide-y divide-border/50">
          {draft.map((p) => (
            <div
              key={p.type}
              className={`flex flex-col gap-2.5 py-3 transition-opacity duration-150 ${p.count ? "" : "opacity-50"}`}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-36 text-sm font-medium">{p.type}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Stepper value={p.count} min={0} max={30} onChange={(n) => set(p.type, { count: n })} /> per project
                </span>
                {p.count > 0 && (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    days
                    <Stepper value={p.startDay} min={0} max={60} onChange={(n) => set(p.type, { startDay: n, endDay: Math.max(n, p.endDay) })} />
                    to
                    <Stepper value={p.endDay} min={p.startDay} max={60} onChange={(n) => set(p.type, { endDay: n })} />
                  </span>
                )}
              </div>
              {/* the range on the project's week, at a glance */}
              {p.count > 0 && (
                <span className="ml-36 grid h-2 grid-cols-8 gap-0.5 max-sm:ml-0">
                  {Array.from({ length: PLAN_DAYS + 1 }, (_, d) => (
                    <span
                      key={d}
                      className={`rounded-full ${
                        d === p.endDay ? "bg-foreground/70" : d >= p.startDay && d < p.endDay ? "bg-foreground/25" : "bg-foreground/[0.06]"
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted">
          {total ? `One project: ${total} task${total === 1 ? "" : "s"}.` : "Nothing is planned for new projects."} Day 0 is the day a
          project starts; its deadline is set when it&apos;s created.
        </p>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-glow disabled:opacity-60">
            {saving ? "Saving…" : "Save blueprint"}
          </button>
        </div>
      </dialog>
    </>
  );
}
