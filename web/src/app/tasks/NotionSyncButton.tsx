"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncFromNotion, type NotionSyncResult } from "./actions";

// The actual Notion logo the user provided — public/notion-logo.webp.
function NotionMark({ size = 14 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 14px icon, no need for next/image's optimization pipeline
  return <img src="/notion-logo.webp" width={size} height={size} alt="" className="shrink-0" />;
}

// Temporary — for testing only, while the team is still creating tasks in
// Notion during the transition. Manual trigger, nothing automatic (no
// cron, no webhook) — only runs when this button is clicked. Delete this
// file and its one usage in page.tsx when Notion is retired for real.
export function NotionSyncButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<NotionSyncResult | null>(null);

  async function sync() {
    setPending(true);
    setResult(null);
    const res = await syncFromNotion();
    setResult(res);
    setPending(false);
  }

  return (
    // fixed to the viewport, not the document flow — otherwise it lands
    // wherever the tallest column's content happens to end, not reliably
    // near the bottom of the screen
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {/* status text first so it stacks above the button, which stays put
          as the last (bottom-most) child regardless of how much text
          shows above it */}
      {result && (
        <p className={`text-xs ${result.error ? "text-red-300" : "text-muted"}`}>
          {result.error
            ? `Notion sync failed: ${result.error}`
            : `Synced ${result.created} new task${result.created === 1 ? "" : "s"}${
                result.skipped ? `, skipped ${result.skipped}` : ""
              }.`}
        </p>
      )}
      {result && result.skippedReasons.length > 0 && (
        <ul className="max-w-md text-center text-[11px] text-muted">
          {result.skippedReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="btn-glow flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        <NotionMark />
        <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
        {pending ? "Syncing…" : "Sync with Notion"}
      </button>
    </div>
  );
}
