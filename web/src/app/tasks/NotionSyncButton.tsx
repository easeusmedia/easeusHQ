"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncFromNotion, type NotionSyncResult } from "./actions";

// Notion has no icon in lucide (it's not a brand-logo set) — this
// approximates their actual mark (a bordered white page with a bold block
// "N"), not just a plain letter chip, so it reads as Notion at a glance.
function NotionMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="white" stroke="black" strokeWidth="2" />
      <path d="M6 18V6H8.5L15.5 16V6H18V18H15.5L8.5 8V18H6Z" fill="black" />
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
    <div className="glass fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2 rounded-xl px-4 py-3">
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
