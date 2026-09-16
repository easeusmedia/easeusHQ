"use client";

import { useOptimistic, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { applyOnboardingTemplate, toggleOnboardingStep } from "./actions";

export type OnboardingStepData = { id: string; title: string; detail: string | null; done: boolean };

// Every client is onboarded the same way — the steps come from the template,
// so a half-set-up client is visible instead of being something you only
// find out about later. Disappears once everything's ticked.
export function ClientOnboarding({ clientId, steps }: { clientId: string; steps: OnboardingStepData[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [applying, setApplying] = useState(false);
  const [optimistic, apply] = useOptimistic(steps, (state, update: { id: string; done: boolean }) =>
    state.map((s) => (s.id === update.id ? { ...s, done: update.done } : s))
  );

  // length comes from the prop, not the optimistic copy: useOptimistic only
  // re-syncs to a new base once a transition settles, so reading it here
  // left the "no checklist yet" state on screen after one was just applied
  const total = steps.length;
  const done = optimistic.filter((s) => s.done).length;

  async function useTemplate() {
    setApplying(true);
    await applyOnboardingTemplate(clientId);
    setApplying(false);
    router.refresh();
  }

  if (total === 0) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border px-5 py-4">
        <p className="text-sm text-muted">This client was set up before the onboarding template existed.</p>
        <button
          onClick={useTemplate}
          disabled={applying}
          className="btn-glow flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
        >
          <RotateCcw size={13} /> {applying ? "Applying…" : "Apply template"}
        </button>
      </div>
    );
  }

  if (done === total) return null; // nothing to nag about once it's finished

  return (
    <section className="rounded-2xl border border-border bg-surface/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">Onboarding</h2>
        <span className="text-xs text-muted">
          {done} of {total} done
        </span>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-green-400/70 transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <ul className="flex flex-col gap-1">
        {optimistic.map((step) => (
          <li key={step.id}>
            <button
              onClick={() =>
                startTransition(async () => {
                  apply({ id: step.id, done: !step.done });
                  await toggleOnboardingStep(step.id, !step.done);
                })
              }
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  step.done ? "border-green-400/40 bg-green-400/20 text-green-300" : "border-border"
                }`}
              >
                {step.done && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${step.done ? "text-muted line-through" : ""}`}>{step.title}</span>
                {step.detail && !step.done && <span className="block text-xs text-muted">{step.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
