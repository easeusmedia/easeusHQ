"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncFromNotion, type NotionSyncResult } from "./actions";

// Notion has no icon in lucide (it's not a brand-logo set) — a small
// black/white "N" chip, matching Notion's own mark, so the button is
// recognizable as "this talks to Notion" at a glance.
function NotionMark({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] bg-black font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.7, lineHeight: 1 }}
    >
      N
    </span>
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
    <div className="mb-6 flex flex-col items-center gap-2">
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
