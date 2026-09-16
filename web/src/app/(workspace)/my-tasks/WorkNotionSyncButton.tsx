"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncWorkTasksToNotion } from "./actions";

// Sends this team's work tasks up to the Editing Queue. One-directional by
// nature: these tasks are born here, so unlike the client board's sync
// there's nothing in Notion to pull back down.
//
// It sits in the toolbar rather than floating at the bottom of the page like
// the client board's button, because this row is where the other controls
// for this view already live.
export function WorkNotionSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await syncWorkTasksToNotion();
      setResult(
        res.error
          ? res.error
          : `${res.pushed} sent to Notion${res.skipped ? `, ${res.skipped} couldn't be sent` : ""}.`
      );
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="btn-glow flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
        {pending ? "Syncing…" : "Sync with Notion"}
      </button>
    </span>
  );
}
