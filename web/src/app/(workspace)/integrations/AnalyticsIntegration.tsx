"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, Copy } from "lucide-react";
import { saveMetaApp } from "./actions";

const field = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Client analytics reads every client's *public* YouTube and Instagram
// numbers. That takes two connections of the team's own, made once here —
// nothing per client. Each client's page then only needs their channel link
// and Instagram handle.
export function AnalyticsIntegration({
  googleReady,
  youtubeAccount,
  youtubeViaServiceAccount,
  metaAppId,
  metaReady,
  instagramAccount,
  justConnected,
  problem,
}: {
  googleReady: boolean;
  // the Google account the YouTube lookups go through, once connected
  youtubeAccount: string | null;
  // no account connected, but the deploy's service account can do it
  youtubeViaServiceAccount: boolean;
  metaAppId: string;
  metaReady: boolean;
  // Easeus's Instagram business account the lookups are made as
  instagramAccount: string | null;
  justConnected: string | null;
  problem: string | null;
}) {
  const router = useRouter();
  const [app, setApp] = useState({ id: metaAppId, secret: "" });
  const [editing, setEditing] = useState(!metaReady);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(problem);
  const [copied, setCopied] = useState(false);
  // this site's own address — known only in the browser
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
  const redirect = `${origin}/api/instagram/callback`;

  // a full page trip (a server redirect out to Google / Facebook), not an
  // in-app navigation
  const go = (platform: string) => {
    window.location.href = `/api/analytics/connect?platform=${platform}`;
  };

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveMetaApp(app.id, app.secret);
    setBusy(false);
    if (res.error) return setError(res.error);
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
            <button type="button" onClick={() => go("youtube")} className={`btn btn-sm ${youtubeAccount ? "btn-ghost" : "btn-glow"}`}>
              {youtubeAccount ? "Reconnect" : "Connect YouTube"}
            </button>
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
            {instagramAccount && connected(`As @${instagramAccount}`)}
          </p>
          {metaReady && !editing && (
            <button type="button" onClick={() => go("instagram")} className={`btn btn-sm ${instagramAccount ? "btn-ghost" : "btn-glow"}`}>
              {instagramAccount ? "Reconnect" : "Connect with Facebook"}
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Clients&apos; accounts are looked up by Easeus&apos;s own Instagram business account, which has to be linked to
          a Facebook Page — sign in with a Facebook account that manages that Page. Goes through the Meta app &ldquo;Easeus
          HQ&rdquo;; its OAuth redirect URI:
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(redirect);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex w-fit max-w-full items-center gap-2 truncate rounded-lg bg-surface-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-hover"
        >
          <span className="truncate font-mono">{redirect}</span>
          {copied ? <Check size={12} className="shrink-0 text-emerald-300" /> : <Copy size={12} className="shrink-0 text-muted" />}
        </button>

        {editing ? (
          <div className="fade-in mt-1 flex flex-col gap-2">
            <p className="text-xs text-muted">The Meta app&apos;s App ID and App secret — App settings → Basic.</p>
            <div className="flex flex-wrap gap-2">
              <input value={app.id} onChange={(e) => setApp((a) => ({ ...a, id: e.target.value }))} placeholder="Meta App ID" className={field} />
              <input
                value={app.secret}
                onChange={(e) => setApp((a) => ({ ...a, secret: e.target.value }))}
                placeholder="App secret"
                type="password"
                className={field}
              />
            </div>
            <div className="flex justify-end gap-2">
              {metaReady && (
                <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
                  Cancel
                </button>
              )}
              <button type="button" onClick={save} disabled={busy} className="btn btn-sm btn-glow disabled:opacity-60">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Meta app <span className="font-mono text-foreground">{metaAppId}</span>
            </p>
            <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
              Change
            </button>
          </div>
        )}
      </div>

      {(error || justConnected) && (
        <p className={`fade-in text-xs ${error ? "text-red-300" : "text-emerald-300"}`}>
          {error ?? `${justConnected === "youtube" ? "YouTube" : "Instagram"} connected.`}
        </p>
      )}
    </section>
  );
}
