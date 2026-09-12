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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="btn-glow flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
      >
        <NotionMark />
        <RefreshCw size={13} className={pending ? "animate-spin" : undefined} />
        {pending ? "Syncing…" : "Sync clients"}
      </button>
      {result && (
        <p className={`text-xs ${result.error ? "text-red-300" : "text-muted"}`}>
          {result.error ? result.error : `${result.created} new, ${result.updated} updated.`}
        </p>
      )}
    </div>
  );
}
