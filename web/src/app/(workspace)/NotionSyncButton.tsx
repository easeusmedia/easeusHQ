"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { pushToNotion, syncFromNotion, type NotionSyncResult } from "./actions";

// The actual Notion logo the user provided — public/notion-logo.webp.
function NotionMark({ size = 14 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 14px icon, no need for next/image's optimization pipeline
  return <img src="/notion-logo.webp" width={size} height={size} alt="" className="shrink-0" />;
}

// Temporary — for testing only, while the team is still creating tasks in
// Notion during the transition. Manual triggers, nothing automatic (no
// cron, no webhook) — they only run when a button is clicked. Delete this
// file and its one usage in page.tsx when Notion is retired for real.
//
// One button per direction, so which way the data moves is always a choice:
// Sync brings Notion's rows down onto our tasks, Push writes our tasks onto
// Notion's fields. Whichever you press wins for the rows it touches.
export function NotionSyncButton() {
  const [running, setRunning] = useState<"pull" | "push" | null>(null);
  const [result, setResult] = useState<{ way: "pull" | "push"; data: NotionSyncResult } | null>(null);

  async function run(way: "pull" | "push") {
    setRunning(way);
    setResult(null);
    const data = way === "pull" ? await syncFromNotion() : await pushToNotion();
    setResult({ way, data });
    setRunning(null);
  }

  const summary = (r: { way: "pull" | "push"; data: NotionSyncResult }) => {
    if (r.data.error) return `${r.way === "pull" ? "Sync" : "Push"} failed: ${r.data.error}`;
    const parts =
      r.way === "pull"
        ? [`${r.data.created} new`, `${r.data.updated} updated`]
        : [`${r.data.pushed} updated in Notion`, ...(r.data.created ? [`${r.data.created} added there`] : [])];
    if (r.data.skipped) parts.push(`${r.data.skipped} skipped`);
    return `${parts.join(", ")}.`;
  };

  return (
    // fixed to the viewport, not the document flow — otherwise it lands
    // wherever the tallest column's content happens to end, not reliably
    // near the bottom of the screen
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {/* status text first so it stacks above the buttons, which stay put
          as the last (bottom-most) child regardless of how much text
          shows above it */}
      {result && (
        <div className="fade-in flex max-w-[min(38rem,calc(100vw-2rem))] flex-col items-center gap-0.5 text-center">
          <p className={`text-xs ${result.data.error ? "text-red-300" : "text-muted"}`}>{summary(result)}</p>
          {/* why something didn't go through, rather than a bare count —
              a row deleted in Notion, an editor we couldn't match, and so on */}
          {result.data.skippedReasons.slice(0, 3).map((reason, i) => (
            <p key={i} className="text-xs text-muted/80">
              {reason}
            </p>
          ))}
          {result.data.skippedReasons.length > 3 && (
            <p className="text-xs text-muted/80">…and {result.data.skippedReasons.length - 3} more.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        {(
          [
            ["pull", ArrowDownToLine, "Sync from Notion", "Syncing…", "Bring Notion's rows into the board"],
            ["push", ArrowUpFromLine, "Push to Notion", "Pushing…", "Write the board's tasks onto their Notion fields"],
          ] as const
        ).map(([way, Icon, label, busy, title]) => (
          <button
            key={way}
            type="button"
            onClick={() => run(way)}
            disabled={running !== null}
            title={title}
            className="btn-glow flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            <NotionMark />
            <Icon size={14} className={running === way ? "animate-pulse" : undefined} />
            {running === way ? busy : label}
          </button>
        ))}
      </div>
    </div>
  );
}
