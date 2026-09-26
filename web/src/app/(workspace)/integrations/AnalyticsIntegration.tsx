"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check } from "lucide-react";
import { saveApifyTokens } from "./actions";

const field = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Client analytics reads every client's *public* YouTube and Instagram
// numbers, scraped with Apify — set up once here with the team's Apify
// tokens, nothing per client and no Google or Facebook login. Each client's
// page then only needs their channel link and Instagram handle.
export function AnalyticsIntegration({
  apifyAccounts,
}: {
  // the Apify accounts clients' pages are scraped with, in the order used
  apifyAccounts: { username: string; left: number | null }[];
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const apifyReady = apifyAccounts.length > 0;
  const [editing, setEditing] = useState(!apifyReady);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveApifyTokens(token);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNote(`${res.saved} token${res.saved === 1 ? "" : "s"} saved${res.rejected ? `, ${res.rejected} not accepted by Apify` : ""}.`);
    setToken("");
    setEditing(false);
    router.refresh();
  }

  const connected = (label: string) => (
    <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
      <Check size={11} /> {label}
    </span>
  );

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center gap-2.5">
        <BarChart3 size={18} className="text-muted" />
        <h2 className="text-base font-medium">Client analytics</h2>
      </div>
      <p className="-mt-2 text-sm text-muted">
        Every client&apos;s public YouTube and Instagram numbers, scraped with Apify — no Google, Instagram or Facebook
        login, and nothing asked of clients. Their page just needs their channel link and Instagram handle.
      </p>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            Apify
            {apifyReady && connected(`${apifyAccounts.length} Apify token${apifyAccounts.length === 1 ? "" : "s"}`)}
          </p>
          {apifyReady && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
              Change
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Apify&apos;s YouTube and Instagram scrapers read each client&apos;s public pages — about $0.005 per YouTube video
          and $0.0027 per Instagram post; results are kept for six hours. With several tokens, each scrape uses the
          first one with credit left, so the next takes over when one runs out.
        </p>
        {apifyReady && !editing && (
          <ol className="flex flex-col gap-1">
            {apifyAccounts.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-1.5 text-xs">
                <span>
                  <span className="text-muted tabular-nums">{i + 1}.</span> {a.username}
                </span>
                <span className={a.left !== null && a.left < 0.25 ? "text-red-300" : "text-muted"}>
                  {a.left === null ? "—" : a.left < 0.25 ? "out of credit this month" : `$${a.left.toFixed(2)} left this month`}
                </span>
              </li>
            ))}
          </ol>
        )}
        {editing && (
          <div className="fade-in mt-1 flex flex-col gap-2">
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Apify API tokens, one per line — used in this order"
              rows={4}
              className={`${field} font-mono text-xs`}
            />
            <div className="flex justify-end gap-2">
              {apifyReady && (
                <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
                  Cancel
                </button>
              )}
              <button type="button" onClick={save} disabled={busy || !token.trim()} className="btn btn-sm btn-glow disabled:opacity-60">
                {busy ? "Checking…" : "Save"}
              </button>
            </div>
          </div>
        )}
        {note && <p className="text-xs text-emerald-300">{note}</p>}
      </div>

      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
