"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export type NoticeData = { title: string; lines?: string[]; error?: boolean };

// How long a notice that went well stays before it goes by itself
const STAYS_MS = 10_000;

// The result of something run from a button (a Notion sync), shown as a
// notification in the corner rather than as loose text under the button:
// it can be closed, and one that went well goes by itself. Render it with
// a new key for each result, so each arrives fresh.
export function Notice({ notice, onClose }: { notice: NoticeData; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);

  // eases out before it's removed, rather than vanishing
  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    if (notice.error) return;
    const timer = setTimeout(close, STAYS_MS);
    return () => clearTimeout(timer);
  }, [notice.error, close]);

  return (
    <div
      role="status"
      className={`glass pop-in fixed top-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-xl px-4 py-3 pr-3 shadow-2xl transition-[opacity,translate] duration-200 ease-out ${
        leaving ? "-translate-y-1 opacity-0" : ""
      }`}
    >
      {notice.error ? (
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-rose-400" />
      ) : (
        <CircleCheck size={16} className="mt-0.5 shrink-0 text-accent" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm">{notice.title}</p>
        {notice.lines?.map((line, i) => (
          <p key={i} className="line-clamp-2 text-xs text-muted">
            {line}
          </p>
        ))}
      </div>
      <button type="button" onClick={close} aria-label="Dismiss" className="btn-ghost -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
        <X size={14} />
      </button>
    </div>
  );
}
