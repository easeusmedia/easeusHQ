"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plug } from "lucide-react";
import { makeClaudeConnection, turnOffClaudeConnection } from "./actions";
import { formatDateTime } from "../TaskCard";

const input = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground";

// Your Claude on the Sales dashboard (MCP): the link to paste into claude.ai,
// made here and shown once; when it was made and last used; a new one (the
// old one stops working) or off. Sales only, as you, and it never deletes.
// On Integrations as a card; in the Account window (anyone in Sales) as a
// section of it, so `className` swaps the card's look, and `onChange` tells
// the window (a refresh redraws only the page) what the link is now.
type Active = { createdAt: string; lastUsedAt: string | null } | null;
export function ClaudeConnection({ active, onChange, className = "mb-4 break-inside-avoid panel rounded-2xl p-5" }: { active: Active; onChange?: (active: Active) => void; className?: string }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState<"new" | "off" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    const res = await makeClaudeConnection().catch(() => ({ error: "That couldn't be made. Check your connection and try again." }) as { error?: string; link?: string });
    setBusy(false);
    setAsking(null);
    if (res.error || !res.link) return setError(res.error ?? "That couldn't be made.");
    setLink(res.link);
    onChange?.({ createdAt: new Date().toISOString(), lastUsedAt: null });
    router.refresh();
  }
  async function turnOff() {
    setBusy(true);
    setError(null);
    const res = await turnOffClaudeConnection().catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setBusy(false);
    setAsking(null);
    if (res.error) return setError(res.error);
    setLink(null);
    onChange?.(null);
    router.refresh();
  }
  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const on = !!active || !!link;
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        <Plug size={18} className="text-muted" />
        <h2 className="text-base font-medium">Claude connection (MCP)</h2>
        {on && (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            <Check size={11} className="text-accent" /> On
          </span>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">Lets your Claude read the Sales boards and add or update leads, as you. Sales only, and it never deletes.</p>

      {link ? (
        <div className="fade-in flex flex-col gap-2">
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Your connection link" className={input} />
            <button type="button" onClick={copy} className="btn btn-sm btn-glow flex items-center gap-1.5">
              {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted">Shown once. In claude.ai: Settings › Connectors › Add custom connector, then paste it. Keep it private: anyone with it can work as you.</p>
        </div>
      ) : (
        active && <p className="text-xs text-muted">Made {formatDateTime(active.createdAt)} · last used {active.lastUsedAt ? formatDateTime(active.lastUsedAt) : "never"}</p>
      )}

      {asking ? (
        <div className="fade-in flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted">{asking === "new" ? "The link you have now stops working." : "Your Claude loses its connection until you make a new link."}</p>
          <button type="button" onClick={() => setAsking(null)} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={asking === "new" ? make : turnOff} disabled={busy} className={`btn btn-sm ${asking === "off" ? "btn-ghost text-red-300" : "btn-glow"}`}>
            {busy ? "Saving…" : asking === "new" ? "Make a new link" : "Turn off"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => (on ? setAsking("new") : make())} disabled={busy} className="btn btn-sm btn-glow">
            {busy ? "Making…" : on ? "Make a new link" : "Make the link"}
          </button>
          {on && (
            <button type="button" onClick={() => setAsking("off")} className="btn btn-sm btn-ghost">
              Turn off
            </button>
          )}
        </div>
      )}
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
