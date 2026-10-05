"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { saveAiBudget, saveClaudeAdminKey, saveClaudeKey } from "./actions";

const input = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground";

// Claude, for Nyra and the contract assistant: the API key it runs on,
// checked before it's kept (only its last four characters are ever shown);
// the monthly limit every call is held to; and, optionally, an Admin API
// key so that limit counts everything on the Anthropic account.
export function ClaudeIntegration({
  ending,
  adminEnding,
  spend,
}: {
  ending: string | null;
  adminEnding: string | null;
  spend: { spent: number; budget: number; account: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<"key" | "admin" | null>(ending ? null : "key");
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(String(spend.budget));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(res.error);
    setKey("");
    setEditing(null);
    router.refresh();
  }

  const keyField = (placeholder: string, save: () => void) => (
    <div className="fade-in flex gap-2">
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={placeholder} autoComplete="off" className={input} />
      <button type="button" onClick={() => setEditing(null)} className="btn btn-sm btn-ghost">
        Cancel
      </button>
      <button type="button" onClick={save} disabled={busy || !key.trim()} className="btn btn-sm btn-glow disabled:opacity-60">
        {busy ? "Checking…" : "Save"}
      </button>
    </div>
  );

  return (
    <section className="mb-4 flex break-inside-avoid flex-col gap-4 panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-muted" />
          <h2 className="text-base font-medium">Claude</h2>
          {ending && (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              <Check size={11} className="text-accent" /> Key ending {ending}
            </span>
          )}
        </div>
        {ending && editing !== "key" && (
          <button type="button" onClick={() => setEditing("key")} className="btn btn-xs btn-ghost">
            Change
          </button>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">Powers Nyra and the contract assistant. Runs on Claude Haiku 4.5, and Sonnet only when a question needs real analysis.</p>
      {editing === "key" && keyField("Anthropic API key (sk-ant-…)", () => run(() => saveClaudeKey(key)))}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Spend this month</p>
          <p className="text-sm tabular-nums">
            ${spend.spent.toFixed(2)} <span className="text-muted">of ${spend.budget.toFixed(2)}</span>
          </p>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (spend.spent / spend.budget) * 100)}%` }} />
        </div>
        <p className="text-xs text-muted">
          {spend.account
            ? `Everything on your Anthropic account, as Anthropic reports it (a few minutes behind). Claude stops answering in the app once it reaches the limit.`
            : `Only what Easeus HQ has spent since it started counting today. Other use of your Anthropic account (the Console, other apps) isn't included: add an Admin API key below and it will be.`}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Monthly limit</span>
          <span className="flex items-center gap-1">
            $
            <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className="w-20 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums" />
          </span>
          {Number(limit) !== spend.budget && (
            <button type="button" onClick={() => run(() => saveAiBudget(Number(limit)))} disabled={busy} className="btn btn-xs btn-glow">
              Save limit
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {adminEnding ? `Reading the account's spend with the Admin API key ending ${adminEnding}.` : "Admin API key: not added. It only reads your spend; it can't send messages."}
          </p>
          {editing !== "admin" && (
            <span className="flex gap-1">
              {adminEnding && (
                <button type="button" onClick={() => run(() => saveClaudeAdminKey(""))} className="btn btn-xs btn-ghost">
                  Remove
                </button>
              )}
              <button type="button" onClick={() => setEditing("admin")} className="btn btn-xs btn-ghost">
                {adminEnding ? "Change" : "Add admin key"}
              </button>
            </span>
          )}
        </div>
        {editing === "admin" && keyField("Admin API key (sk-ant-admin…)", () => run(() => saveClaudeAdminKey(key)))}
      </div>
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
