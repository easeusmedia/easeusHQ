"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { setClientSharing } from "./actions";

// The switch for a client's own page. On, anyone opening
// app.easeus.media/clients/<name> without signing in sees the client view;
// the team still gets this page at the same address.
export function ClientShare({ clientId, slug, enabled }: { clientId: string; slug: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    start(async () => {
      const res = await setClientSharing(clientId, !enabled);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/clients/${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        role="switch"
        aria-checked={enabled}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
          enabled ? "border-green-400/30 bg-green-400/15 text-green-300" : "border-border bg-surface-2 text-muted hover:text-foreground"
        }`}
      >
        <Globe size={13} />
        {enabled ? "Shared with client" : "Share with client"}
      </button>
      {enabled && (
        <span className="fade-in flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="btn-glow flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          {/* the client's view, as they'll see it */}
          <a href={`/share/${slug}`} target="_blank" rel="noopener" className="btn-glow flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
            <ExternalLink size={13} /> Client view
          </a>
        </span>
      )}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
