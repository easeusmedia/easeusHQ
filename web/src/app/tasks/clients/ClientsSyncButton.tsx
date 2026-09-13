"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncClientsFromNotion, type ClientSyncResult } from "./actions";

// eslint-disable-next-line @next/next/no-img-element -- fixed 14px icon, no need for next/image's pipeline
function NotionMark({ size = 14 }: { size?: number }) {
  return <img src="/notion-logo.webp" width={size} height={size} alt="" className="shrink-0" />;
}

// Unlike the task sync button, this one isn't temporary — the Clients
// Dashboard in Notion stays the source of truth for the roster (name +
// status) even once the task-editing workflow moves fully off Notion.
export function ClientsSyncButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ClientSyncResult | null>(null);

  async function sync() {
    setPending(true);
    setResult(null);
    setResult(await syncClientsFromNotion());
    setPending(false);
  }

  return (
    // fixed to the viewport, bottom-center — same spot and same reasoning
    // as the task board's "Sync with Notion" button: a safety net to tally
    // against Notion (still the real source of truth for now), not a
    // primary action that deserves top-bar real estate
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {result && (
        <p className={`text-xs ${result.error ? "text-red-300" : "text-muted"}`}>
          {result.error ? result.error : `${result.created} new, ${result.updated} updated.`}
        </p>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="btn-glow flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        <NotionMark />
        <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
        {pending ? "Syncing…" : "Sync clients"}
      </button>
    </div>
  );
}
