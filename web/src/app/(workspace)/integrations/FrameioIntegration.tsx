"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Film, Unplug } from "lucide-react";
import { frameioConsentUrl } from "@/lib/frameioClient";
import { chooseFrameioAccount, disconnectFrameio, listFrameioAccounts, testFrameio } from "./actions";

// Two steps: let Adobe hand over the connection, then say which Frame.io
// account the work lives in — this login has three, and a share only
// resolves against the account that owns it.
export function FrameioIntegration({
  hasApp,
  connected,
  account,
  accountId,
  accountName,
  clientId,
  justConnected,
}: {
  hasApp: boolean;
  connected: boolean;
  account: string | null;
  accountId: string | null;
  accountName: string | null;
  clientId: string;
  justConnected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(justConnected ? "Connected." : null);
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);

  function connect() {
    window.location.href = frameioConsentUrl(clientId, window.location.origin, "frameio");
  }

  async function loadAccounts() {
    setBusy("accounts");
    setError(null);
    const res = await listFrameioAccounts();
    setBusy(null);
    if (res.error) return setError(res.error);
    setOptions(res.accounts ?? []);
  }

  async function choose(id: string) {
    setBusy(id);
    setError(null);
    const res = await chooseFrameioAccount(id);
    setBusy(null);
    if (res.error) return setError(res.error);
    setOk("Saved.");
    setOptions(null);
    router.refresh();
  }

  async function test() {
    setBusy("test");
    setError(null);
    setOk(null);
    const res = await testFrameio();
    setBusy(null);
    if (res.error) return setError(res.error);
    setOk(res.ok ?? "Working.");
  }

  async function disconnect() {
    setBusy("disconnect");
    await disconnectFrameio();
    setBusy(null);
    setOk(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center gap-2.5">
        <Film size={18} className="text-muted" />
        <h2 className="text-base font-medium">Frame.io</h2>
        {connected && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
            <Check size={11} /> Connected
          </span>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">
        So a delivered task can offer to copy its finished file straight from the review link into Creative Exports.
        Read-only: nothing is ever written back to Frame.io.
      </p>

      {!hasApp ? (
        <p className="text-sm text-red-300">
          The Frame.io app details are missing. They&apos;re set once, from the server.
        </p>
      ) : !connected ? (
        <button type="button" onClick={connect} className="btn-glow w-fit rounded-lg px-4 py-2 text-sm font-medium">
          Connect Frame.io
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Connected as <span className="text-foreground">{account || "—"}</span>
            {accountId && (
              <>
                {" · "}account <span className="text-foreground">{accountName ?? accountId}</span>
              </>
            )}
          </p>

          {!accountId && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
              <p className="text-xs text-amber-200">
                This login has more than one Frame.io account. Pick the one the editors&apos; review links belong to.
              </p>
              {options === null ? (
                <button type="button" onClick={loadAccounts} disabled={busy === "accounts"} className="btn-ghost w-fit rounded-lg px-3 py-1.5 text-xs">
                  {busy === "accounts" ? "Looking…" : "Show accounts"}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {options.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => choose(a.id)}
                      disabled={!!busy}
                      className="btn-ghost rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      {busy === a.id ? "Saving…" : a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={test} disabled={!!busy} className="btn-ghost rounded-lg px-3 py-2 text-sm disabled:opacity-60">
              {busy === "test" ? "Checking…" : "Test it"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
            >
              <Unplug size={14} /> Disconnect
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && !error && <p className="text-sm text-emerald-300">{ok}</p>}
    </section>
  );
}
