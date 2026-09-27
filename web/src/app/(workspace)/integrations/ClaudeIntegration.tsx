"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { saveClaudeKey } from "./actions";

// Claude, for the contract assistant — an Anthropic API key, checked before
// it's kept. Only its last four characters are ever shown.
export function ClaudeIntegration({ ending }: { ending: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!ending);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveClaudeKey(key);
    setBusy(false);
    if (res.error) return setError(res.error);
    setKey("");
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-muted" />
          <h2 className="text-base font-medium">Claude</h2>
          {ending && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
              <Check size={11} /> Key ending {ending}
            </span>
          )}
        </div>
        {ending && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
            Change
          </button>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">Powers the contract assistant, which edits contracts from your instructions. Runs on Claude Haiku 4.5.</p>
      {editing && (
        <div className="fade-in flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Anthropic API key (sk-ant-…)"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground"
          />
          {ending && (
            <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
          )}
          <button type="button" onClick={save} disabled={busy || !key.trim()} className="btn btn-sm btn-glow disabled:opacity-60">
            {busy ? "Checking…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
