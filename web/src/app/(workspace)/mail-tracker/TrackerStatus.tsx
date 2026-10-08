"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Download } from "lucide-react";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Asks the extension whether it's here (it answers from this page, where it
// also picks up the key): connected, or how to install it
export function TrackerStatus({ tracked }: { tracked: { from: string; count: number; last: string | null }[] }) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const hear = (e: MessageEvent) => {
      if (e.source === window && e.data?.type === "easeus-mail-tracker:here") setVersion(String(e.data.version ?? ""));
    };
    window.addEventListener("message", hear);
    const ask = () => window.postMessage({ type: "easeus-mail-tracker:ping" }, window.location.origin);
    ask();
    const timer = setInterval(ask, 1500);
    return () => {
      window.removeEventListener("message", hear);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="mt-6 flex flex-col gap-3">
      {version !== null ? (
        <div className="panel flex items-center gap-3 rounded-2xl px-5 py-4">
          <CircleCheck size={18} className="shrink-0 text-emerald-400" />
          <p className="text-sm">Connected. Every email sent from Gmail in this browser is tracked.</p>
        </div>
      ) : (
        <ol className="panel flex list-decimal flex-col gap-3 rounded-2xl py-4 pr-5 pl-10 text-sm marker:text-muted">
          <li>
            <a href="/mail-tracker.zip" download className="btn btn-ghost -my-1 inline-flex items-center gap-1.5">
              <Download size={14} /> Download the tracker
            </a>{" "}
            and unzip it.
          </li>
          <li>
            In Chrome, open <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs">chrome://extensions</span> and turn on Developer mode, top right.
          </li>
          <li>Click Load unpacked and choose the Easeus Mail Tracker folder.</li>
          <li>Reload this page and any open Gmail tab.</li>
        </ol>
      )}

      {tracked.length > 0 && (
        <div className="panel rounded-2xl px-5 py-3">
          {tracked.map((t) => (
            <div key={t.from} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="truncate">{t.from || "Unknown"}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {t.count} tracked{t.last ? ` · last ${when(t.last)}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
