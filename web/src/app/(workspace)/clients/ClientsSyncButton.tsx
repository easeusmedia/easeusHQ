"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncClientsFromNotion, type ClientSyncResult } from "./actions";
import { Notice } from "../Notice";

// eslint-disable-next-line @next/next/no-img-element -- fixed 14px icon, no need for next/image's pipeline
function NotionMark({ size = 14 }: { size?: number }) {
  return <img src="/notion-logo.webp" width={size} height={size} alt="" className="shrink-0" />;
}

// Unlike the task sync button, this one isn't temporary — the Clients
// Dashboard in Notion stays the source of truth for the roster (name +
// status) even once the task-editing workflow moves fully off Notion.
export function ClientsSyncButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<(ClientSyncResult & { id: number }) | null>(null);
  const runs = useRef(0);

  async function sync() {
    setPending(true);
    setResult(null);
    setResult({ ...(await syncClientsFromNotion()), id: ++runs.current });
    setPending(false);
  }

  return (
    // fixed to the viewport, bottom-center — same spot and same reasoning
    // as the task board's "Sync with Notion" button: a safety net to tally
    // against Notion (still the real source of truth for now), not a
    // primary action that deserves top-bar real estate
    <>
      {/* outside the bar: its centring translate would pin a fixed notice
          to the bar rather than to the screen's corner */}
      {result && (
        <Notice
          key={result.id}
          notice={
            result.error
              ? { title: "Sync failed", lines: [result.error], error: true }
              : { title: `Clients synced from Notion: ${result.created} new, ${result.updated} updated.` }
          }
          onClose={() => setResult(null)}
        />
      )}
      <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
        <button
          type="button"
          onClick={sync}
          disabled={pending}
          className="btn btn-glow gap-2 disabled:opacity-60"
        >
          <NotionMark />
          <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
          {pending ? "Syncing…" : "Sync clients"}
        </button>
      </div>
    </>
  );
}
