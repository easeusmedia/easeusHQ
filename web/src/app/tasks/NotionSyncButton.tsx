"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncFromNotion, type NotionSyncResult } from "./actions";

// Notion has no icon in lucide (it's not a brand-logo set) — redrawn
// against their real logo: a black-bordered white square with a bold "N"
// that has flared, wedge-shaped serif ends top-left and bottom-right, not
// a plain rectangular block letter.
function NotionMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="white" stroke="black" strokeWidth="2.4" />
      <path d="M6.5 18V6.3L8.4 6L16.2 16.2V6H17.8V17.7L15.9 18L8.1 7.8V18H6.5Z" fill="black" />
      <path d="M5.3 7.7L6.6 6.2L8.9 6.7L7.1 8.4Z" fill="black" />
      <path d="M18.7 16.3L17.4 17.8L15.1 17.3L16.9 15.6Z" fill="black" />
    </svg>
  );
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
    </div>
  );
}
