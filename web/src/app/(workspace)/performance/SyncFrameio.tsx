"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncFeedback } from "./actions";

// New Frame.io review comments into the editors' feedback, now rather than
// tonight. Says what it found.
export function SyncFrameio() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setSaid(null);
    const res = await syncFeedback();
    setBusy(false);
    if (res.error) {
      setSaid(res.error);
      return setTimeout(() => setSaid(null), 6000);
    }
    setSaid(
      !res.added
        ? "No new comments."
        : `${res.added} new comment${res.added === 1 ? "" : "s"}${res.sorted ? `, ${res.mistakes} sorted as mistakes` : ", to sort by hand"}.`
    );
    router.refresh();
    // a passing note, not a fixture of the header
    setTimeout(() => setSaid(null), 4000);
  }

  return (
    <span className="flex items-center gap-2">
      {said && <span className="fade-in text-xs text-muted">{said}</span>}
      <button onClick={run} disabled={busy} className="btn btn-ghost flex items-center gap-1.5 disabled:opacity-60">
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Syncing…" : "Sync Frame.io"}
      </button>
    </span>
  );
}
