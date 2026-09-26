"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Layers, Minus, Plus, Receipt } from "lucide-react";
import { setBillingRule, createInvoice, updateInvoiceStatus } from "./actions";
import { DatePicker } from "../DatePicker";
import { Reveal } from "../Reveal";
import { Dropdown } from "../Dropdown";

type BillingCadence = "monthly_date" | "milestone";
type InvoiceStatus = "draft" | "ready" | "sent" | "paid" | "overdue";
type Invoice = { id: string; amount: string; status: InvoiceStatus; dueDate: Date | null; createdAt: Date };

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "ready", "sent", "paid", "overdue"];
// a coloured dot on the status chip, rather than a native <select> — its
// options are drawn by the OS, blue hover and all
const STATUS_DOT: Record<InvoiceStatus, string> = {
  draft: "bg-muted",
  ready: "bg-blue-400",
  sent: "bg-purple-400",
  paid: "bg-green-400",
  overdue: "bg-red-400",
};

const ROW = "grid grid-cols-[1fr_1fr_auto] items-center gap-4 px-5 sm:grid-cols-[1.2fr_1fr_1fr_auto]";
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const RULES = [
  {
    key: "monthly_date",
    title: "Monthly",
    hint: "One invoice on a fixed day each month",
    Icon: CalendarDays,
    tint: "bg-amber-400/15 text-amber-300",
  },
  {
    key: "milestone",
    title: "By deliverables",
    hint: "One invoice after every few deliverables",
    Icon: Layers,
    tint: "bg-violet-400/15 text-violet-300",
  },
] as const;

// − 30 + : no native spinner arrows, and never outside 1…max
function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(1, Math.round(n) || 1)));
  const step = "grid h-8 w-8 place-items-center text-muted transition-colors hover:text-foreground disabled:opacity-30";
  return (
    <span className="inline-flex items-center rounded-lg bg-surface-2">
      <button type="button" aria-label="Less" onClick={() => set(value - 1)} disabled={value <= 1} className={step}>
        <Minus size={13} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className="w-9 bg-transparent text-center text-sm font-medium tabular-nums outline-none! [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label="More" onClick={() => set(value + 1)} disabled={value >= max} className={step}>
        <Plus size={13} />
      </button>
    </span>
  );
}

export function BillingPanel({
  clientId,
  cadence,
  dayOfMonth,
  milestoneCount,
  deliveredSinceInvoice,
  invoices,
}: {
  clientId: string;
  cadence: BillingCadence | null;
  dayOfMonth: number | null;
  milestoneCount: number | null;
  // only meaningful when cadence === "milestone" — count of delivered
  // tasks since lastInvoicedAt, computed server-side
  deliveredSinceInvoice: number;
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [editingRule, setEditingRule] = useState(false);
  const [ruleCadence, setRuleCadence] = useState<BillingCadence>(cadence ?? "monthly_date");
  const [ruleDay, setRuleDay] = useState(dayOfMonth ?? 30);
  const [ruleCount, setRuleCount] = useState(milestoneCount ?? 4);
  const [savingRule, setSavingRule] = useState(false);

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRule() {
    setSavingRule(true);
    const res = await setBillingRule(
      clientId,
      ruleCadence,
      ruleCadence === "monthly_date" ? ruleDay : null,
      ruleCadence === "milestone" ? ruleCount : null
    );
    setSavingRule(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditingRule(false);
    router.refresh();
  }

  function closeRule() {
    setEditingRule(false);
    setRuleCadence(cadence ?? "monthly_date");
    setRuleDay(dayOfMonth ?? 30);
    setRuleCount(milestoneCount ?? 4);
  }

  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await createInvoice(clientId, Number(amount), dueDate || null);
    setCreating(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAmount("");
    setDueDate("");
    setShowInvoiceForm(false);
    router.refresh();
  }

  async function pickStatus(invoiceId: string, status: InvoiceStatus) {
    await updateInvoiceStatus(invoiceId, status);
    router.refresh();
  }

  const ready = cadence === "milestone" && milestoneCount != null && deliveredSinceInvoice >= milestoneCount;

  const sum = (list: Invoice[]) => list.reduce((n, inv) => n + Number(inv.amount), 0);
  const owed = invoices.filter((inv) => ["ready", "sent", "overdue"].includes(inv.status));
  const overdue = invoices.filter((inv) => inv.status === "overdue").length;
  const paid = invoices.filter((inv) => inv.status === "paid");
  const tile = "card-surface flex flex-col gap-1 rounded-2xl px-5 py-4 shadow-sm";

  return (
    // The tab's full width, like the rest of the client page: what's owed,
    // what's been paid and the rule across the top, the invoices as a table
    // under it — rather than one narrow card with the page empty beside it.
    <div className="flex flex-col">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={tile}>
          <p className="text-xs text-muted">Outstanding</p>
          <p className={`text-2xl font-semibold tabular-nums ${owed.length ? "text-foreground" : "text-muted"}`}>
            {money(sum(owed))}
          </p>
          <p className="text-xs text-muted">
            {owed.length ? `${owed.length} unpaid` : "Nothing owed"}
            {overdue > 0 && <span className="text-red-300"> · {overdue} overdue</span>}
          </p>
        </div>
        <div className={tile}>
          <p className="text-xs text-muted">Paid</p>
          <p className={`text-2xl font-semibold tabular-nums ${paid.length ? "text-foreground" : "text-muted"}`}>
            {money(sum(paid))}
          </p>
          <p className="text-xs text-muted">
            {paid.length} invoice{paid.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className={tile}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Billing rule</p>
            <button
              onClick={() => (editingRule ? closeRule() : setEditingRule(true))}
              className="btn btn-xs btn-ghost -my-1"
            >
              {editingRule ? "Close" : cadence ? "Edit" : "Set rule"}
            </button>
          </div>
          {cadence === "milestone" && milestoneCount ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {Math.min(deliveredSinceInvoice, milestoneCount)}
                <span className="text-muted"> / {milestoneCount}</span>
              </p>
              <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${ready ? "bg-emerald-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.min(100, (deliveredSinceInvoice / milestoneCount) * 100)}%` }}
                />
              </div>
              <p className={`flex items-center gap-1 text-xs ${ready ? "text-emerald-300" : "text-muted"}`}>
                {ready ? (
                  <>
                    <Check size={11} /> Ready to invoice
                  </>
                ) : (
                  "delivered since the last invoice"
                )}
              </p>
            </>
          ) : cadence === "monthly_date" ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">Day {dayOfMonth}</p>
              <p className="text-xs text-muted">of every month</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-muted">Not set</p>
              <p className="text-xs text-muted">When this client gets invoiced</p>
            </>
          )}
        </div>
      </div>

      <Reveal open={editingRule}>
        {/* Two ways to bill, as two cards: pick one, and its number sits
            right in the sentence it sets. */}
        <div className="mt-3 card-surface rounded-2xl p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {RULES.map((r) => {
              const on = ruleCadence === r.key;
              const monthly = r.key === "monthly_date";
              return (
                <div
                  key={r.key}
                  onClick={() => setRuleCadence(r.key)}
                  className={`flex cursor-pointer flex-col gap-4 rounded-xl p-4 transition-[background-color,box-shadow] duration-200 ${
                    on ? "bg-foreground/[0.05] ring-1 ring-blue-400/50" : "bg-foreground/[0.02] hover:bg-foreground/[0.04]"
                  }`}
                >
                  <button type="button" aria-pressed={on} className="flex items-start gap-3 text-left outline-none!">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${r.tint}`}>
                      <r.Icon size={16} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{r.title}</span>
                      <span className="block text-xs text-muted">{r.hint}</span>
                    </span>
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-200 ${
                        on ? "bg-blue-500 text-white" : "border border-border"
                      }`}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                  </button>
                  <div
                    className={`flex flex-wrap items-center gap-2 text-sm transition-opacity duration-200 ${
                      on ? "" : "opacity-40"
                    }`}
                  >
                    <span className="text-muted">{monthly ? "On day" : "Every"}</span>
                    <Stepper
                      value={monthly ? ruleDay : ruleCount}
                      max={monthly ? 31 : 99}
                      onChange={monthly ? setRuleDay : setRuleCount}
                    />
                    <span className="text-muted">
                      {monthly ? (ruleDay >= 28 ? "of each month (month end)" : "of each month") : "deliverables"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={closeRule} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button onClick={saveRule} disabled={savingRule} className="btn btn-sm btn-primary disabled:opacity-60">
              {savingRule ? "Saving…" : "Save rule"}
            </button>
          </div>
        </div>
      </Reveal>

      <section className="mt-4 card-surface overflow-hidden rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <h3 className="text-sm font-medium">
            Invoices <span className="ml-1 text-muted tabular-nums">{invoices.length || ""}</span>
          </h3>
          {!showInvoiceForm && (
            <button onClick={() => setShowInvoiceForm(true)} className="btn btn-xs btn-glow flex items-center gap-1">
              <Plus size={13} /> New invoice
            </button>
          )}
        </div>

        <Reveal open={showInvoiceForm}>
          <form
            onSubmit={submitInvoice}
            className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-surface-2/40 px-5 py-3"
          >
            <input
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="Amount (₹)"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            />
            <div className="w-48">
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowInvoiceForm(false)} className="btn btn-sm btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn btn-sm btn-primary disabled:opacity-60">
                {creating ? "Creating…" : "Create invoice"}
              </button>
            </div>
          </form>
        </Reveal>

        {error && <p className="border-t border-border/60 px-5 py-2 text-xs text-red-300">{error}</p>}

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 border-t border-border/60 px-5 py-10 text-center">
            <Receipt size={20} className="text-muted/60" />
            <p className="text-sm text-muted">No invoices yet</p>
          </div>
        ) : (
          <div className="border-t border-border/60 text-sm">
            <div className={`${ROW} py-2 text-xs text-muted`}>
              <span>Amount</span>
              <span>Due</span>
              <span className="hidden sm:block">Raised</span>
              <span className="text-right">Status</span>
            </div>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className={`${ROW} border-t border-border/40 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.02]`}
              >
                <span className="font-medium tabular-nums">{money(Number(inv.amount))}</span>
                <span className={inv.status === "overdue" ? "text-red-300" : "text-muted"}>
                  {inv.dueDate ? day(inv.dueDate) : "—"}
                </span>
                <span className="hidden text-muted sm:block">{day(inv.createdAt)}</span>
                <span className="justify-self-end">
                  <Dropdown
                    value={inv.status}
                    pill={{ icon: <span className={`size-2 rounded-full ${STATUS_DOT[inv.status]}`} /> }}
                    options={STATUS_OPTIONS.map((st) => ({ value: st, label: st[0].toUpperCase() + st.slice(1) }))}
                    onChange={(v) => pickStatus(inv.id, v as InvoiceStatus)}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
