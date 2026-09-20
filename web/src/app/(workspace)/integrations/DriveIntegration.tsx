"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, ExternalLink, FolderOpen, Link2, Unplug } from "lucide-react";
import { consentUrl, redirectUri } from "@/lib/driveClient";
import { disconnectGoogle, saveGoogleApp, testDrive } from "./actions";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Three steps, in the order they have to happen: tell the app which Google
// app it is, let Google hand over the connection, then say which folder
// client folders belong in.
export function DriveIntegration({
  hasApp,
  connected,
  account,
  folderName,
  folderId,
  clientId,
  justConnected,
  problem,
}: {
  hasApp: boolean;
  connected: boolean;
  account: string | null;
  folderName: string | null;
  folderId: string | null;
  clientId: string;
  justConnected: boolean;
  problem: string | null;
}) {
  const router = useRouter();
  const [app, setApp] = useState({ id: clientId, secret: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(problem);
  const [ok, setOk] = useState<string | null>(justConnected ? "Connected." : null);

  async function saveApp() {
    setBusy("app");
    setError(null);
    const res = await saveGoogleApp(app.id, app.secret);
    setBusy(null);
    if (res.error) return setError(res.error);
    setOk("Saved. Now connect the account.");
    router.refresh();
  }

  function connect() {
    // straight to Google's own consent screen; it comes back to the callback
    window.location.href = consentUrl(app.id || clientId, window.location.origin, "drive");
  }

  async function test() {
    setBusy("test");
    setError(null);
    setOk(null);
    const res = await testDrive();
    setBusy(null);
    if (res.error) return setError(res.error);
    setOk(res.ok ?? "Working.");
  }

  async function disconnect() {
    setBusy("off");
    await disconnectGoogle();
    setBusy(null);
    setOk(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Google Drive</h2>
          <p className="text-xs text-muted">
            {connected
              ? `Connected as ${account ?? "your Google account"}${folderName ? ` · new client folders go in ${folderName}` : ""}`
              : "Files a client uploads when they onboard go straight into your Drive."}
          </p>
        </div>
        {connected && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
            <Check size={12} /> Connected
          </span>
        )}
      </div>

      {!connected && (
        <ol className="flex flex-col gap-4 border-t border-border pt-4 text-sm">
          <li className="flex flex-col gap-2">
            <p className="font-medium">1. The Google app</p>
            <p className="text-xs text-muted">
              In the Google Cloud console: APIs &amp; Services → Credentials → Create credentials → OAuth client ID →
              Web application. Add this as an authorised redirect URI:
            </p>
            <code className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs break-all">
              {typeof window === "undefined" ? "" : redirectUri(window.location.origin)}
            </code>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={app.id} onChange={(e) => setApp((a) => ({ ...a, id: e.target.value }))} placeholder="Client ID" className={field} />
              <input value={app.secret} onChange={(e) => setApp((a) => ({ ...a, secret: e.target.value }))} placeholder="Client secret" className={field} />
            </div>
            <button onClick={saveApp} disabled={busy === "app"} className="btn-glow w-fit rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
              {busy === "app" ? "Saving…" : "Save"}
            </button>
          </li>

          <li className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="font-medium">2. Approve it</p>
            <p className="text-xs text-muted">
              Sign in with the Google account whose Drive the team uses. If Google warns the app isn&apos;t verified,
              choose Advanced → Continue: it&apos;s your own app.
            </p>
            <button
              onClick={connect}
              disabled={!hasApp && !app.id}
              className="btn-glow flex w-fit items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60"
            >
              <Link2 size={13} /> Connect Google Drive
            </button>
          </li>
        </ol>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Where client folders go</p>
        {connected && folderId ? (
          <>
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-xs text-blue-400 hover:underline"
            >
              <FolderOpen size={13} /> {folderName ?? "Client files folder"} <ExternalLink size={11} />
            </a>
            <p className="text-xs text-muted">
              Easeus HQ made this folder in your Drive and puts each client&apos;s folder inside it. Drag it wherever you
              like — into Current Projects / Raw Files, say — and uploads keep going to it.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            Once connected, Easeus HQ makes its own folder in your Drive for client files. It can only ever see what it
            creates there — never the rest of your Drive.
          </p>
        )}
      </div>

      {(ok || error) && (
        <p className={`fade-in text-xs ${error ? "text-red-300" : "text-emerald-300"}`}>{error ?? ok}</p>
      )}

      {connected && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button onClick={test} disabled={busy === "test"} className="btn-ghost rounded-lg px-4 py-2 text-xs disabled:opacity-60">
            {busy === "test" ? "Testing…" : "Test it"}
          </button>
          <button onClick={disconnect} disabled={busy === "off"} className="btn-ghost flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs text-red-300 disabled:opacity-60">
            <Unplug size={13} /> Disconnect
          </button>
        </div>
      )}
    </section>
  );
}
