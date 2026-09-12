"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { setBillingRule, createInvoice, updateInvoiceStatus } from "./actions";

type BillingCadence = "monthly_date" | "milestone";
type InvoiceStatus = "draft" | "ready" | "sent" | "paid" | "overdue";
type Invoice = { id: string; amount: string; status: InvoiceStatus; dueDate: Date | null; createdAt: Date };

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "ready", "sent", "paid", "overdue"];
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-surface text-muted border-border",
  ready: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  sent: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  paid: "bg-green-400/15 text-green-300 border-green-400/30",
  overdue: "bg-red-400/15 text-red-300 border-red-400/30",
};

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

  return (
    <section className="card-surface flex flex-col gap-4 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Billing</h2>
        {!editingRule && (
          <button onClick={() => setEditingRule(true)} className="btn-ghost rounded-md px-2 py-1 text-xs">
            {cadence ? "Edit rule" : "Set billing rule"}
          </button>
        )}
      </div>

      {editingRule ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setRuleCadence("monthly_date")}
              className={`flex-1 rounded-md px-2 py-1.5 ${ruleCadence === "monthly_date" ? "bg-surface text-foreground" : "text-muted"}`}
            >
              Fixed day of month
            </button>
            <button
              onClick={() => setRuleCadence("milestone")}
              className={`flex-1 rounded-md px-2 py-1.5 ${ruleCadence === "milestone" ? "bg-surface text-foreground" : "text-muted"}`}
            >
              Every N deliverables
            </button>
          </div>
          {ruleCadence === "monthly_date" ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              Invoice on day
              <input
                type="number"
                min={1}
                max={31}
                value={ruleDay}
                onChange={(e) => setRuleDay(Number(e.target.value))}
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-foreground"
              />
              of every month
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs text-muted">
              Invoice every
              <input
                type="number"
                min={1}
                value={ruleCount}
                onChange={(e) => setRuleCount(Number(e.target.value))}
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-foreground"
              />
              delivered tasks
            </label>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => setEditingRule(false)} className="btn-ghost rounded-md px-3 py-1 text-xs">
              Cancel
            </button>
            <button onClick={saveRule} disabled={savingRule} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
              {savingRule ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : cadence === "monthly_date" ? (
        <p className="text-sm text-muted">Invoices go out on day {dayOfMonth} of every month.</p>
      ) : cadence === "milestone" ? (
        <div className="flex items-center gap-2 text-sm">
          <span className={ready ? "font-medium text-emerald-300" : "text-muted"}>
            {deliveredSinceInvoice} of {milestoneCount} delivered since last invoice
          </span>
          {ready && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
              <Check size={11} /> Ready to invoice
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">No billing rule set yet.</p>
      )}

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted">Invoices</h3>
          {!showInvoiceForm && (
            <button onClick={() => setShowInvoiceForm(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
              <Plus size={13} /> New invoice
            </button>
          )}
        </div>

        {showInvoiceForm && (
          <form onSubmit={submitInvoice} className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInvoiceForm(false)} className="btn-ghost rounded-md px-3 py-1 text-xs">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

        {invoices.length === 0 ? (
          <p className="text-xs text-muted">No invoices yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
                <span className="font-medium">₹{inv.amount}</span>
                <span className="text-muted">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "no due date"}</span>
                <select
                  value={inv.status}
                  onChange={(e) => pickStatus(inv.id, e.target.value as InvoiceStatus)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[inv.status]}`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="bg-surface-2 text-foreground">
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
