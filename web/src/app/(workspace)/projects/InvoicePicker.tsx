"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { moveProjectToInvoice } from "../clients/actions";

// Which invoice this project is billed in, changeable in place — the same
// move as dragging it to another invoice on the client's page. Any project,
// finished or not. Where invoices are numbered, any number can be typed in.
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
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);

  async function pick(picked: string) {
    // typed in: "7" or "Invoice 7" is invoice 7
    const typed = picked.match(/^\s*(?:invoice\s*)?#?\s*(\d+)\s*$/i);
    if (!options.some((o) => o.value === picked) && !typed) return setError("An invoice number must be a whole number, such as 7.");
    const key = typed ? `batch-${Number(typed[1])}` : picked;
    if (key === current) return;
    const before = current;
    setCurrent(key);
    setError(null);
    const res = await moveProjectToInvoice(projectId, key === "none" ? null : key);
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
          options.some((o) => o.value === current)
            ? options
            : [...options, { value: current, label: `Invoice ${current.replace("batch-", "")}` }]
        }
        onChange={pick}
        placeholder="No invoice"
        create={numbered}
        search={numbered ? { recent: 12, placeholder: "Invoice number…" } : undefined}
        pill={{ icon: <Receipt size={12} className="text-emerald-400" /> }}
      />
      {error && <span className="text-xs text-red-300">{error}</span>}
    </>
  );
}
