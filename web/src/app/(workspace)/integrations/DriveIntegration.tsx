"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Link2, Unplug } from "lucide-react";
import { consentUrl, redirectUri } from "@/lib/driveClient";
import { disconnectGoogle, saveBrandAssetsName, saveDriveFolder, saveGoogleApp, testDrive } from "./actions";
import { SettingRow } from "./SettingRow";

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
  exportsName,
  exportsId,
  brandAssets,
  clientId,
  justConnected,
  problem,
}: {
  hasApp: boolean;
  connected: boolean;
  account: string | null;
  folderName: string | null;
  folderId: string | null;
  exportsName: string | null;
  exportsId: string | null;
  brandAssets: string;
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
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-transparent bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
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
            <button onClick={saveApp} disabled={busy === "app"} className="btn btn-primary w-fit disabled:opacity-60">
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
              className="btn btn-primary flex w-fit items-center gap-1.5 disabled:opacity-60"
            >
              <Link2 size={13} /> Connect Google Drive
            </button>
          </li>
        </ol>
      )}

      {/* Everything the app files into, each changeable in place. A new
          folder is checked before it replaces the old one. */}
      {connected && (
        <div className="flex flex-col divide-y divide-border/60 border-t border-border pt-4">
          <SettingRow
            label="Raw Files"
            hint="Where each new client's folder is made when they onboard."
            value={folderName ?? (folderId ? "Chosen folder" : null)}
            href={folderId ? `https://drive.google.com/drive/folders/${folderId}` : null}
            placeholder="Paste the folder's Drive link"
            onSave={(link) => saveDriveFolder("raw", link)}
          />
          <SettingRow
            label="Brand assets folder name"
            hint={`Inside each client's folder — their uploads land at ${folderName ?? "Raw Files"} / Client / ${brandAssets}.`}
            value={brandAssets}
            placeholder="e.g. Brand assets"
            onSave={saveBrandAssetsName}
          />
          <SettingRow
            label="Creative Exports"
            hint="Where a delivered file is copied from Frame.io — into Client / Project inside it."
            value={exportsName ?? (exportsId ? "Chosen folder" : null)}
            href={exportsId ? `https://drive.google.com/drive/folders/${exportsId}` : null}
            placeholder="Paste the folder's Drive link"
            onSave={(link) => saveDriveFolder("exports", link)}
          />
        </div>
      )}

      {(ok || error) && (
        <p className={`fade-in text-xs ${error ? "text-red-300" : "text-emerald-300"}`}>{error ?? ok}</p>
      )}

      {connected && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button onClick={test} disabled={busy === "test"} className="btn btn-ghost disabled:opacity-60">
            {busy === "test" ? "Testing…" : "Test it"}
          </button>
          <button onClick={disconnect} disabled={busy === "off"} className="btn btn-ghost flex items-center gap-1.5 text-red-300 disabled:opacity-60">
            <Unplug size={13} /> Disconnect
          </button>
        </div>
      )}
    </section>
  );
}
