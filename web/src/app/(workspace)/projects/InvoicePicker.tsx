"use client";

import { useState } from "react";
import { CalendarDays, Layers } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { moveProjectToInvoice } from "../clients/actions";

// Which batch (or month) this project is in, changeable in place, the same
// move as dragging it to another batch on the client's page. Any project,
// finished or not. Where batches are numbered, any number can be typed in,
// and "New batch" starts the next one (Abhishek, 21 Nov 2026: batches, not
// invoices).
export function InvoicePicker({
  projectId,
  value,
  options,
  numbered,
}: {
  projectId: string;
  // an invoice key, or "none"
  value: string;
  options: { value: string; label: string }[];
  // invoices are numbered (not monthly): a typed number is an invoice
  numbered: boolean;
}) {
  // none is empty: the placeholder, "No invoice"
  const [current, setCurrent] = useState(value === "none" ? "" : value);
  const [error, setError] = useState<string | null>(null);

  async function pick(picked: string) {
    // typed in: "7" or "Batch 7" is batch 7
    const typed = picked.match(/^\s*(?:batch\s*|invoice\s*)?#?\s*(\d+)\s*$/i);
    if (picked && !options.some((o) => o.value === picked) && !typed) return setError("A batch number must be a whole number, such as 7.");
    const key = typed ? `batch-${Number(typed[1])}` : picked;
    if (key === current) return;
    const before = current;
    setCurrent(key);
    setError(null);
    const res = await moveProjectToInvoice(projectId, key || null);
    if (res.error) {
      setCurrent(before);
      setError(res.error);
    }
  }

  return (
    <>
      <Dropdown
        value={current}
        // a number typed in that isn't one of the listed invoices yet
        options={
          !current || options.some((o) => o.value === current)
            ? options
            : [...options, { value: current, label: `Batch ${current.replace("batch-", "")}` }]
        }
        onChange={pick}
        placeholder={numbered ? "No batch" : "No month"}
        create={numbered}
        search={numbered ? { recent: 12, placeholder: "Batch number…" } : undefined}
        pill={{ icon: numbered ? <Layers size={12} className="text-violet-300" /> : <CalendarDays size={12} className="text-amber-300" /> }}
      />
      {error && <span className="text-xs text-red-300">{error}</span>}
    </>
  );
}
