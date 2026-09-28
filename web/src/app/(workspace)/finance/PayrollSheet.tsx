"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Sheet } from "lucide-react";
import { savePayrollSheet } from "./actions";

// The payroll spreadsheet's link: open it, or paste it in the first time.
export function PayrollSheet({ url }: { url: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!url);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await savePayrollSheet(value);
    if (res.error) return setError(res.error);
    setError(null);
    setEditing(!value.trim());
    router.refresh();
  }

  if (!editing && url)
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-foreground">
          Change
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost flex items-center gap-1.5">
          <Sheet size={13} /> Payroll sheet <ArrowUpRight size={12} />
        </a>
      </span>
    );

  return (
    <form onSubmit={save} className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the payroll sheet's link"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground"
        />
        <button type="submit" className="btn btn-sm btn-glow">
          Save
        </button>
        {url && (
          <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
            Cancel
          </button>
        )}
      </span>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </form>
  );
}
