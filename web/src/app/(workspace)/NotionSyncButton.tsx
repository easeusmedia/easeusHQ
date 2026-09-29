"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { pushToNotion, syncFromNotion, type NotionSyncResult } from "./actions";
import { Notice, type NoticeData } from "./Notice";

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
  const [result, setResult] = useState<{ id: number; way: "pull" | "push"; data: NotionSyncResult } | null>(null);
  // each run's notice arrives fresh, even with the last one still showing
  const runs = useRef(0);

  async function run(way: "pull" | "push") {
    setRunning(way);
    setResult(null);
    const data = way === "pull" ? await syncFromNotion() : await pushToNotion();
    setResult({ id: ++runs.current, way, data });
    setRunning(null);
  }

  // what happened, and why anything didn't go through: a row deleted in
  // Notion, an editor we couldn't match, and so on
  const notice = (r: { way: "pull" | "push"; data: NotionSyncResult }): NoticeData => {
    if (r.data.error) return { title: `${r.way === "pull" ? "Sync" : "Push"} failed`, lines: [r.data.error], error: true };
    const parts =
      r.way === "pull"
        ? [`${r.data.created} new`, `${r.data.updated} updated`]
        : [`${r.data.pushed} updated in Notion`, ...(r.data.created ? [`${r.data.created} added there`] : [])];
    if (r.data.skipped) parts.push(`${r.data.skipped} skipped`);
    const reasons = r.data.skippedReasons;
    return {
      title: `${r.way === "pull" ? "Synced from Notion" : "Pushed to Notion"}: ${parts.join(", ")}.`,
      lines: [...reasons.slice(0, 2), ...(reasons.length > 2 ? [`And ${reasons.length - 2} more.`] : [])],
    };
  };

  return (
    <>
      {/* outside the bar: its centring translate would pin a fixed
          notice to the bar rather than to the screen's corner */}
      {result && <Notice key={result.id} notice={notice(result)} onClose={() => setResult(null)} />}
      {/* fixed to the viewport, not the document flow — otherwise it lands
          wherever the tallest column's content happens to end, not
          reliably near the bottom of the screen */}
      <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
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
              className="btn btn-glow gap-2 disabled:opacity-60"
            >
              <NotionMark />
              <Icon size={14} className={running === way ? "animate-pulse" : undefined} />
              {running === way ? busy : label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
