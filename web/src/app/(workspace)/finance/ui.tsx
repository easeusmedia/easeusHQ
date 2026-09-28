"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { updateInvoiceStatus } from "../clients/actions";
import { deleteSalaryPayment, recordSalaryPayment, savePayDetails, updateInvoiceDetails } from "./actions";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";
const label = "flex min-w-0 flex-col gap-1 text-xs text-muted";

function useSave<A>(fn: (a: A) => Promise<{ error?: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function run(a: A) {
    setBusy(true);
    setDone(false);
    const res = await fn(a);
    setBusy(false);
    if (res.error) return setError(res.error);
    setError(null);
    setDone(true);
    router.refresh();
  }
  return { busy, error, done, run };
}

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready to send" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

// An invoice's status, and the details Skydo will fill in once connected.
export function InvoiceEditor({ id, status, number, currency, notes }: { id: string; status: string; number: string; currency: string; notes: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ number, currency, notes });
  const save = useSave(updateInvoiceDetails);
  return (
    <div className="flex flex-col gap-4">
      <div className={label}>
        Status
        <Dropdown
          value={status}
          options={STATUSES}
          onChange={async (v) => {
            await updateInvoiceStatus(id, v as "draft");
            router.refresh();
          }}
        />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className={label}>
          Invoice number
          <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="From Skydo, once connected" className={field} />
        </label>
        <label className={label}>
          Currency
          <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} className={`${field} uppercase`} />
        </label>
      </div>
      <label className={label}>
        Notes
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={field} />
      </label>
      <div className="flex items-center justify-end gap-3">
        {save.error && <span className="mr-auto text-xs text-red-300">{save.error}</span>}
        {save.done && <span className="text-xs text-muted">Saved.</span>}
        <button onClick={() => save.run({ id, ...form })} disabled={save.busy} className="btn btn-sm btn-glow disabled:opacity-60">
          {save.busy ? "Saving…" : "Save details"}
        </button>
      </div>
    </div>
  );
}

// How someone is paid: salary (the same one on their profile), structure, cycle.
export function PayDetails({ userId, salary, payStructure, payCycle }: { userId: string; salary: string; payStructure: string; payCycle: string }) {
  const [form, setForm] = useState({ salary, payStructure, payCycle });
  const save = useSave(savePayDetails);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className={label}>
          <span>
            Salary <span className="text-muted/70">· Monthly, INR</span>
          </span>
          <input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} inputMode="numeric" placeholder="Not set" className={field} />
        </label>
        <div className={label}>
          Pay structure
          <Dropdown
            defaultValue={form.payStructure}
            placeholder="Not set"
            onChange={(v) => setForm({ ...form, payStructure: v })}
            options={[
              { value: "fixed", label: "Fixed monthly" },
              { value: "per_video", label: "Per video" },
              { value: "hourly", label: "Hourly" },
            ]}
          />
        </div>
        <div className={label}>
          Pay cycle
          <Dropdown
            defaultValue={form.payCycle}
            placeholder="Not set"
            onChange={(v) => setForm({ ...form, payCycle: v })}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "fortnightly", label: "Fortnightly" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {save.error && <span className="mr-auto text-xs text-red-300">{save.error}</span>}
        {save.done && <span className="text-xs text-muted">Saved.</span>}
        <button onClick={() => save.run({ userId, ...form })} disabled={save.busy} className="btn btn-sm btn-glow disabled:opacity-60">
          {save.busy ? "Saving…" : "Save pay details"}
        </button>
      </div>
    </div>
  );
}

// A month's pay, recorded by hand until the payroll sheet is connected.
// Picking a month already recorded loads it, to correct.
export function RecordPayment({
  userId,
  months,
  today,
  existing,
}: {
  userId: string;
  months: { value: string; label: string; due: number }[];
  today: string;
  existing: Record<string, { amount: number; paid: number; paidOn: string; note: string }>;
}) {
  const initial = (period: string) => {
    const e = existing[period];
    const due = months.find((m) => m.value === period)?.due ?? 0;
    return { period, amount: String(e?.amount ?? due), paid: String(e?.paid ?? due), paidOn: e?.paidOn || today, note: e?.note ?? "" };
  };
  const [form, setForm] = useState(() => initial(months[0]?.value ?? today.slice(0, 7)));
  const save = useSave(recordSalaryPayment);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_0.8fr_1.5fr]">
        <div className={label}>
          Month
          <Dropdown value={form.period} options={months} onChange={(v) => setForm(initial(v))} />
        </div>
        <label className={label}>
          Due
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" className={field} />
        </label>
        <label className={label}>
          Paid
          <input value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} inputMode="numeric" className={field} />
        </label>
        <div className={label}>
          Paid on
          <DatePicker value={form.paidOn} onChange={(v) => setForm({ ...form, paidOn: v || today })} clearable={false} />
        </div>
      </div>
      <label className={label}>
        Note
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Bonus, deduction, bank reference…" className={field} />
      </label>
      <div className="flex items-center justify-end gap-3">
        {save.error && <span className="mr-auto text-xs text-red-300">{save.error}</span>}
        {save.done && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Check size={12} /> Recorded
          </span>
        )}
        <button onClick={() => save.run({ userId, ...form })} disabled={save.busy} className="btn btn-sm btn-glow disabled:opacity-60">
          {save.busy ? "Saving…" : existing[form.period] ? "Update payment" : "Record payment"}
        </button>
      </div>
    </div>
  );
}

export function DeletePayment({ id, month }: { id: string; month: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      confirm="Remove"
      message={`Remove the ${month} payment record?`}
      className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
      onConfirm={async () => {
        await deleteSalaryPayment(id);
        router.refresh();
      }}
    >
      <Trash2 size={13} />
    </ConfirmButton>
  );
}
