"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PenLine } from "lucide-react";
import { saveAdobeKey } from "./actions";

// Adobe Acrobat Sign, for sending contracts out for e-signature — connected
// once with an integration key from the account that sends them.
export function AdobeSignIntegration({ account }: { account: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!account);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveAdobeKey(key);
    setBusy(false);
    if (res.error) return setError(res.error);
    setKey("");
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <PenLine size={18} className="text-muted" />
          <h2 className="text-base font-medium">Adobe Acrobat Sign</h2>
          {account && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
              <Check size={11} /> {account}
            </span>
          )}
        </div>
        {account && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost">
            Change
          </button>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">
        Approved contracts go out from here for e-signature: you sign first as easeus.media@gmail.com, then it goes
        to the client by email. The signature and date fields are placed automatically.
      </p>
      {editing && (
        <div className="fade-in flex flex-col gap-2">
          <p className="text-xs text-muted">
            In Acrobat Sign: Account → Acrobat Sign API → API Information → Integration Key. Give it the
            agreement_read, agreement_write and agreement_send scopes, then paste it here.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Integration key"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-foreground"
            />
            {account && (
              <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
                Cancel
              </button>
            )}
            <button type="button" onClick={save} disabled={busy || !key.trim()} className="btn btn-sm btn-glow disabled:opacity-60">
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="fade-in text-xs text-red-300">{error}</p>}
    </section>
  );
}
