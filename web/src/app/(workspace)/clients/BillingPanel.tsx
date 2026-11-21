"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Layers } from "lucide-react";
import { setBillingRule } from "./actions";
import { Stepper } from "../Stepper";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";

type BillingCadence = "monthly_date" | "milestone";

// How this client's projects are grouped, in batches of a set number or
// month by month: a small setting beside the Projects title, where its
// effect shows (Abhishek, 21 Nov 2026: no Billing tab for it)
const RULES = [
  { key: "milestone", title: "Batches", Icon: Layers, tint: "bg-violet-400/15 text-violet-300" },
  { key: "monthly_date", title: "Monthly", Icon: CalendarDays, tint: "bg-amber-400/15 text-amber-300" },
] as const;

export function GroupingSetting({
  clientId,
  cadence,
  dayOfMonth,
  milestoneCount,
}: {
  clientId: string;
  cadence: BillingCadence | null;
  dayOfMonth: number | null;
  milestoneCount: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ruleCadence, setRuleCadence] = useState<BillingCadence | null>(cadence);
  const [ruleDay, setRuleDay] = useState(dayOfMonth ?? 30);
  const [ruleCount, setRuleCount] = useState(milestoneCount ?? 4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(250);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);
  useEffect(() => {
    const out = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);

  const label = cadence === "milestone" ? `Batches of ${milestoneCount ?? 4}` : cadence === "monthly_date" ? "Monthly" : "Group projects";
  const Icon = cadence === "monthly_date" ? CalendarDays : Layers;
  const changed =
    ruleCadence !== cadence ||
    (ruleCadence === "milestone" && ruleCount !== (milestoneCount ?? 4)) ||
    (ruleCadence === "monthly_date" && ruleDay !== (dayOfMonth ?? 30));

  async function save() {
    if (!ruleCadence) return;
    setSaving(true);
    setError(null);
    const res = await setBillingRule(
      clientId,
      ruleCadence,
      ruleCadence === "monthly_date" ? ruleDay : null,
      ruleCadence === "milestone" ? ruleCount : null,
    ).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setSaving(false);
    if (res.error) return setError(res.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setRuleCadence(cadence);
            setRuleDay(dayOfMonth ?? 30);
            setRuleCount(milestoneCount ?? 4);
            setError(null);
            place(trigger.current, { width: 300 });
          }
          setOpen((v) => !v);
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-muted transition-colors hover:border-hover hover:text-foreground"
      >
        <Icon size={13} />
        {label}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 flex flex-col gap-1.5 rounded-xl popover p-2 shadow-lg"
        >
          {/* two ways: pick one, its number right in the line it sets */}
          {RULES.map((r) => {
            const on = ruleCadence === r.key;
            const monthly = r.key === "monthly_date";
            return (
              <div
                key={r.key}
                onClick={() => setRuleCadence(r.key)}
                className={`flex cursor-pointer flex-col gap-2.5 rounded-lg p-3 transition-[background-color,box-shadow] duration-200 ${
                  on ? "bg-foreground/[0.05] ring-1 ring-blue-400/50" : "hover:bg-foreground/[0.03]"
                }`}
              >
                <button type="button" aria-pressed={on} className="flex items-center gap-2.5 text-left outline-none!">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-md ${r.tint}`}>
                    <r.Icon size={14} />
                  </span>
                  <span className="flex-1 text-sm font-medium">{r.title}</span>
                  <span className={`grid size-4.5 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? "bg-blue-500 text-white" : "border border-border"}`}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                </button>
                <div className={`flex flex-wrap items-center gap-2 text-xs transition-opacity duration-200 ${on ? "" : "opacity-40"}`}>
                  <span className="text-muted">{monthly ? "Closes on day" : "Every"}</span>
                  <Stepper value={monthly ? ruleDay : ruleCount} max={monthly ? 31 : 99} onChange={monthly ? setRuleDay : setRuleCount} />
                  <span className="text-muted">{monthly ? (ruleDay >= 28 ? "(month end)" : "of the month") : "projects"}</span>
                </div>
              </div>
            );
          })}
          {error && <p className="px-1 text-xs text-red-300">{error}</p>}
          <div className="flex justify-end gap-2 px-1 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving || !ruleCadence || !changed} className="btn btn-sm btn-glow disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
