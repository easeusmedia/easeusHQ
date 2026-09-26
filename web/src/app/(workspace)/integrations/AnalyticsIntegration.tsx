"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, Copy } from "lucide-react";
import { saveInstagramApp } from "./actions";

const field = "min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Client analytics: what has to be set up once so each client's YouTube and
// Instagram can be connected from their own Analytics tab. YouTube rides on
// the Google app above; Instagram needs a Meta app of its own.
export function AnalyticsIntegration({
  googleReady,
  instagramAppId,
  instagramReady,
}: {
  googleReady: boolean;
  instagramAppId: string;
  instagramReady: boolean;
}) {
  const router = useRouter();
  const [app, setApp] = useState({ id: instagramAppId, secret: "" });
  const [editing, setEditing] = useState(!instagramReady);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // this site's own address — known only in the browser
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
  const redirect = `${origin}/api/instagram/callback`;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveInstagramApp(app.id, app.secret);
    setBusy(false);
    if (res.error) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center gap-2.5">
        <BarChart3 size={18} className="text-muted" />
        <h2 className="text-base font-medium">Client analytics</h2>
      </div>
      <p className="-mt-2 text-sm text-muted">
        Set up once; then each client&apos;s YouTube and Instagram are connected from the Analytics tab on their page.
        Read-only on both.
      </p>

      <div className="flex flex-col gap-1.5 border-t border-border pt-4">
        <p className="flex items-center gap-2 text-sm">
          YouTube
          {googleReady && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
              <Check size={11} /> Uses the Google app
            </span>
          )}
        </p>
        <p className="text-xs text-muted">
          {googleReady ? "The Google app above is used." : "Needs the Google app above first."} In its Google Cloud
          project, switch on <span className="text-foreground">YouTube Data API v3</span>,{" "}
          <span className="text-foreground">YouTube Analytics API</span> and{" "}
          <span className="text-foreground">YouTube Reporting API</span> (the last is what gives impressions and CTR),
          and add the <span className="text-foreground">youtube.readonly</span> and{" "}
          <span className="text-foreground">yt-analytics.readonly</span> scopes to its consent screen.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="flex items-center gap-2 text-sm">
          Instagram
          {instagramReady && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
              <Check size={11} /> App set up
            </span>
          )}
        </p>
        <p className="text-xs text-muted">
          A Meta app with the <span className="text-foreground">Instagram</span> product (&ldquo;API setup with
          Instagram login&rdquo;), asking for <span className="text-foreground">instagram_business_basic</span> and{" "}
          <span className="text-foreground">instagram_business_manage_insights</span>. Add this as its OAuth redirect
          URI:
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
            <div className="flex flex-wrap gap-2">
              <input value={app.id} onChange={(e) => setApp((a) => ({ ...a, id: e.target.value }))} placeholder="Instagram app ID" className={field} />
              <input
                value={app.secret}
                onChange={(e) => setApp((a) => ({ ...a, secret: e.target.value }))}
                placeholder="Instagram app secret"
                type="password"
                className={field}
              />
            </div>
            <div className="flex justify-end gap-2">
              {instagramReady && (
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
              App ID <span className="font-mono text-foreground">{instagramAppId}</span>
            </p>
            <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
              Change
            </button>
          </div>
        )}
        <p className="text-xs text-muted/80">
          While the app is in development mode, each client account has to be added to it as an Instagram tester
          (App roles → Roles) and accept the invite in Instagram before it can be connected.
        </p>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    </section>
  );
}
