import { Check } from "lucide-react";

// Where a contract stands, in words, and the colour of its pill
export function contractStage(status: string, missing: number): { label: string; tone: string; dot: string } {
  if (status === "invited") return { label: "Waiting for client", tone: "border-white/10 bg-white/[0.04] text-muted", dot: "bg-slate-400" };
  if (status === "draft" && missing > 0)
    return { label: `Needs ${missing} detail${missing === 1 ? "" : "s"}`, tone: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200", dot: "bg-amber-400" };
  if (status === "draft") return { label: "Ready for review", tone: "border-sky-400/25 bg-sky-400/[0.08] text-sky-200", dot: "bg-sky-400" };
  if (status === "approved") return { label: "Ready to send", tone: "border-violet-400/25 bg-violet-400/[0.08] text-violet-200", dot: "bg-violet-400" };
  if (status === "sent") return { label: "Out for signature", tone: "border-blue-400/25 bg-blue-400/[0.08] text-blue-200", dot: "bg-blue-400" };
  return { label: "Signed", tone: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200", dot: "bg-emerald-400" };
}

export const STEPS = ["Client's form", "Terms", "Approved", "Out for signature", "Signed"];

// how far along it is: the step it's on (5 once signed — every step done)
export function stepOf(status: string) {
  return { invited: 0, draft: 1, approved: 2, sent: 3, signed: 5 }[status] ?? 1;
}

// The road from link to signed copy, and where this contract is on it
export function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/[0.05] bg-surface/40 px-4 py-3 [scrollbar-width:none]">
      {STEPS.map((label, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={label} className="flex min-w-fit flex-1 items-center gap-2 last:flex-none">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] transition-colors ${
                done
                  ? "bg-gradient-to-br from-violet-400 to-sky-400 text-white"
                  : current
                    ? "bg-violet-400/15 ring-1 ring-violet-300/60"
                    : "ring-1 ring-white/15"
              }`}
            >
              {done ? <Check size={11} strokeWidth={3} /> : current ? <span className="size-1.5 animate-pulse rounded-full bg-violet-300" /> : null}
            </span>
            <span className={`whitespace-nowrap text-xs ${done || current ? "text-foreground" : "text-muted"}`}>{label}</span>
            {i < STEPS.length - 1 && (
              <span className={`mx-1 h-px min-w-6 flex-1 ${done ? "bg-gradient-to-r from-violet-400/70 to-sky-400/70" : "bg-white/10"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
