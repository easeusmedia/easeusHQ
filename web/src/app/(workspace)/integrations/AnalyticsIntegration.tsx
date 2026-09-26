"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check } from "lucide-react";
import { saveApifyTokens } from "./actions";

const field = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Client analytics reads every client's *public* YouTube and Instagram
// numbers: YouTube through the team's own Google account, Instagram through
// Apify's scraper — both set up once here, nothing per client. Each client's
// page then only needs their channel link and Instagram handle.
export function AnalyticsIntegration({
  googleReady,
  youtubeAccount,
  youtubeViaServiceAccount,
  apifyAccounts,
  justConnected,
  problem,
}: {
  googleReady: boolean;
  // the Google account the YouTube lookups go through, once connected
  youtubeAccount: string | null;
  // no account connected, but the deploy's service account can do it
  youtubeViaServiceAccount: boolean;
  // the Apify accounts Instagram is scraped with, in the order they're used
  apifyAccounts: { username: string; left: number | null }[];
  justConnected: string | null;
  problem: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const apifyReady = apifyAccounts.length > 0;
  const [editing, setEditing] = useState(!apifyReady);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(problem);

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
        Every client&apos;s public YouTube and Instagram numbers, read through two connections of our own — made once,
        here. Clients aren&apos;t asked for anything; their page just needs their channel link and Instagram handle.
      </p>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            YouTube
            {youtubeAccount ? connected(`As ${youtubeAccount}`) : youtubeViaServiceAccount && connected("Service account")}
          </p>
          {googleReady && (
            // a full page trip out to Google's consent screen, not an in-app
            // navigation
            <form action="/api/analytics/connect" method="get">
              <input type="hidden" name="platform" value="youtube" />
              <button className={`btn btn-sm ${youtubeAccount ? "btn-ghost" : "btn-glow"}`}>
                {youtubeAccount ? "Reconnect" : "Connect YouTube"}
              </button>
            </form>
          )}
        </div>
        <p className="text-xs text-muted">
          {googleReady
            ? "Any Google account of ours will do — it only reads what's public. Uses the Google app above, with YouTube Data API v3 switched on in its Cloud project."
            : "Needs the Google app above first."}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            Instagram
            {apifyReady && connected(`${apifyAccounts.length} Apify token${apifyAccounts.length === 1 ? "" : "s"}`)}
          </p>
          {apifyReady && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
              Change
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Scraped from each client&apos;s public profile with Apify&apos;s Instagram Scraper — no Instagram or Facebook
          login, nothing asked of the client. About $0.0027 per post read; results are kept for six hours. With several
          tokens, each scrape uses the first one with credit left, so the next takes over when one runs out.
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

      {(error || justConnected) && (
        <p className={`fade-in text-xs ${error ? "text-red-300" : "text-emerald-300"}`}>
          {error ?? "YouTube connected."}
        </p>
      )}
    </section>
  );
}
