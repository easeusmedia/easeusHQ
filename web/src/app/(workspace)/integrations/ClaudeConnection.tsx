"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plug } from "lucide-react";
import { turnOffClaudeConnection } from "./actions";
import { formatDateTime } from "../TaskCard";

const input = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground";

type Active = { createdAt: string; lastUsedAt: string | null } | null;

// Your Claude on the Sales dashboard (MCP): the one address to paste into
// Claude, which then signs you in (lib/mcp/oauth); once connected, when and
// last used, and Disconnect. On Integrations as a card; in the Account
// window as a section of it, so `className` swaps the card's look, and
// `onChange` tells the window (a refresh redraws only the page).
export function ClaudeConnection({ url, active, onChange, className = "mb-4 break-inside-avoid panel rounded-2xl p-5" }: { url: string; active: Active; onChange?: (active: Active) => void; className?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOff() {
    setBusy(true);
    setError(null);
    const res = await turnOffClaudeConnection().catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setBusy(false);
    setAsking(false);
    if (res.error) return setError(res.error);
    onChange?.(null);
    router.refresh();
  }
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        <Plug size={18} className="text-muted" />
        <h2 className="text-base font-medium">Claude connection (MCP)</h2>
        {active && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            <Check size={11} className="text-accent" /> Connected
          </span>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">Lets your Claude read the Sales boards and add or update leads, as you. It never deletes.</p>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Connector address" className={input} />
          <button type="button" onClick={copy} className="btn btn-sm btn-glow flex items-center gap-1.5">
            {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted">In Claude: Settings › Connectors › Add custom connector, paste it, then Connect and sign in.</p>
      </div>

      {active &&
        (asking ? (
          <div className="fade-in flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted">Your Claude loses its connection until you connect again.</p>
            <button type="button" onClick={() => setAsking(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="btn btn-sm btn-ghost text-red-300">
              {busy ? "Saving…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted">
              Connected {formatDateTime(active.createdAt)} · last used {active.lastUsedAt ? formatDateTime(active.lastUsedAt) : "never"}
            </p>
            <button type="button" onClick={() => setAsking(true)} className="btn btn-sm btn-ghost">
              Disconnect
            </button>
          </div>
        ))}
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
