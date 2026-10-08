"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload } from "lucide-react";
import { pullFromNotion, syncWorkTasksToNotion } from "./actions";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Sync brings Notion workbooks down into to-dos; Push sends what changed
// here up to Notion. Each column goes to its own field both ways.
export function WorkNotionSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"pull" | "push" | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function run(which: "pull" | "push") {
    setResult(null);
    setRunning(which);
    startTransition(async () => {
      if (which === "pull") {
        const res = await pullFromNotion();
        const parts = [res.added && `${res.added} added`, res.updated && `${res.updated} updated`, res.removed && `${res.removed} removed`].filter(Boolean);
        setResult(res.error ?? (parts.length ? `${parts.join(", ")} from Notion.` : "Up to date with Notion."));
      } else {
        const res = await syncWorkTasksToNotion();
        setResult(res.error ?? (res.pushed || res.skipped ? `${plural(res.pushed, "task")} sent to Notion${res.skipped ? `, ${res.skipped} couldn't be sent` : ""}.` : "Nothing new to send."));
      }
      setRunning(null);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center justify-center gap-2">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button type="button" onClick={() => run("pull")} disabled={pending} className="btn btn-ghost flex items-center gap-1.5 disabled:opacity-60">
        <RefreshCw size={14} className={running === "pull" ? "animate-spin" : undefined} />
        {running === "pull" ? "Syncing…" : "Sync with Notion"}
      </button>
      <button type="button" onClick={() => run("push")} disabled={pending} className="btn btn-ghost flex items-center gap-1.5 disabled:opacity-60">
        <Upload size={14} className={running === "push" ? "animate-pulse" : undefined} />
        {running === "push" ? "Pushing…" : "Push to Notion"}
      </button>
    </span>
  );
}
