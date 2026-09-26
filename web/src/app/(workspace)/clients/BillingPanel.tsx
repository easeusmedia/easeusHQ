"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { setBillingRule, createInvoice, updateInvoiceStatus } from "./actions";
import { DatePicker } from "../DatePicker";

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
          <button onClick={() => setEditingRule(true)} className="btn btn-xs btn-ghost">
            {cadence ? "Edit rule" : "Set billing rule"}
          </button>
        )}
      </div>

      {editingRule ? (
        // Sized to its content, not stretched across the page: the two
        // choices were 850px-wide halves with Save floating off at the far
        // edge. A switch, the sentence it configures, and the actions right
        // underneath it.
        <div className="fade-in flex w-full max-w-md flex-col gap-3 rounded-xl bg-surface-2/60 p-4">
          <div className="inline-flex w-fit rounded-lg bg-surface p-1 text-xs">
            {(
              [
                ["monthly_date", "Fixed day of month"],
                ["milestone", "Every N deliverables"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRuleCadence(key)}
                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                  ruleCadence === key ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            {ruleCadence === "monthly_date" ? "Invoice on day" : "Invoice every"}
            <input
              type="number"
              min={1}
              max={ruleCadence === "monthly_date" ? 31 : undefined}
              value={ruleCadence === "monthly_date" ? ruleDay : ruleCount}
              onChange={(e) =>
                ruleCadence === "monthly_date" ? setRuleDay(Number(e.target.value)) : setRuleCount(Number(e.target.value))
              }
              className="w-16 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-center text-sm text-foreground"
            />
            {ruleCadence === "monthly_date" ? "of every month" : "delivered tasks"}
          </label>
          <div className="flex gap-2">
            <button onClick={saveRule} disabled={savingRule} className="btn btn-sm btn-glow disabled:opacity-60">
              {savingRule ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditingRule(false)} className="btn btn-sm btn-ghost">
              Cancel
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
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
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
            <button onClick={() => setShowInvoiceForm(true)} className="btn btn-xs btn-ghost flex items-center gap-1">
              <Plus size={13} /> New invoice
            </button>
          )}
        </div>

        {showInvoiceForm && (
          <form
            onSubmit={submitInvoice}
            className="fade-in mb-3 flex w-full max-w-xl flex-wrap items-center gap-2 rounded-xl bg-surface-2/60 p-3"
          >
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="Amount"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            />
            <div className="w-48">
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
            </div>
            <span className="flex-1" />
            <button type="button" onClick={() => setShowInvoiceForm(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn btn-sm btn-glow disabled:opacity-60">
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        )}

        {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

        {invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
                <span className="w-28 font-medium tabular-nums">₹{inv.amount}</span>
                <span className="flex-1 text-xs text-muted">
                  {inv.dueDate
                    ? `Due ${new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                    : "No due date"}
                </span>
                <select
                  value={inv.status}
                  onChange={(e) => pickStatus(inv.id, e.target.value as InvoiceStatus)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[inv.status]}`}
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
