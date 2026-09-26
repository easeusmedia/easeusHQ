"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

const field = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// One thing the app depends on, shown as what it's currently set to and
// changeable in place. Every integration setting uses this, so they all
// behave the same way: the new value is checked on the server (does that
// folder open, is that a database we can read) before it replaces the old
// one — a bad paste never gets saved.
export function SettingRow({
  label,
  hint,
  value,
  href,
  placeholder,
  onSave,
}: {
  label: string;
  // what changing it actually changes
  hint: string;
  // what it's set to now, in words — a folder's or database's name
  value: string | null;
  // where that value opens, when it's a place
  href?: string | null;
  placeholder: string;
  onSave: (input: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await onSave(input.trim());
    setBusy(false);
    if (res.error) return setError(res.error);
    setEditing(false);
    setInput("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">{label}</p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            className="btn btn-xs btn-ghost shrink-0"
          >
            Change
          </button>
        )}
      </div>

      {!editing &&
        (value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit max-w-full items-center gap-1.5 truncate text-xs text-sky-300 hover:underline"
            >
              {value} <ExternalLink size={11} className="shrink-0" />
            </a>
          ) : (
            <p className="text-xs text-foreground">{value}</p>
          )
        ) : (
          <p className="text-xs text-muted/70">Not set</p>
        ))}

      {editing && (
        <div className="fade-in flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
            className={field}
          />
          <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost shrink-0">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !input.trim()}
            className="btn btn-sm btn-primary shrink-0 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </div>
  );
}
