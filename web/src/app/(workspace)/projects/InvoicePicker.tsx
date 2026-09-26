"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { moveProjectToInvoice } from "../clients/actions";

// Which invoice this project is billed in, changeable in place — the same
// move as dragging it to another invoice on the client's page.
export function InvoicePicker({
  projectId,
  value,
  options,
}: {
  projectId: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);

  async function pick(key: string) {
    if (key === current) return;
    const before = current;
    setCurrent(key);
    setError(null);
    const res = await moveProjectToInvoice(projectId, key);
    if (res.error) {
      setCurrent(before);
      setError(res.error);
    }
  }

  return (
    <>
      <Dropdown
        value={current}
        options={options}
        onChange={pick}
        pill={{ icon: <Receipt size={12} className="text-emerald-400" /> }}
      />
      {error && <span className="text-xs text-red-300">{error}</span>}
    </>
  );
}
