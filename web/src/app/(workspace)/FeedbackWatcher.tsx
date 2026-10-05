"use client";

import { useEffect, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { MessageSquare, X } from "lucide-react";
import { onPulse, type PulseData } from "./pulseStore";

type Note = NonNullable<PulseData["feedback"]>[number];

const KEY = "client-feedback-seen";

// A notice in the bottom-right corner when a client sends a message from
// their shared page — for the people who read those (see
// seesClientFeedback). Each message is announced once per browser; opening
// it goes to that client's page, where the Messages button has it.
export function FeedbackWatcher() {
  const [notes, setNotes] = useState<Note[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!seen.current) {
      try {
        seen.current = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
      } catch {
        seen.current = new Set();
      }
    }

    // each pulse (see Pulse.tsx) carries the unread client messages
    return onPulse(({ feedback: rows }) => {
      if (!rows) return;
      const known = seen.current!;
      const fresh = rows.filter((r) => !known.has(r.id));
      if (fresh.length === 0) return;
      fresh.forEach((r) => known.add(r.id));
      setNotes((n) => [...fresh, ...n].slice(0, 3));
      try {
        localStorage.setItem(KEY, JSON.stringify([...known].slice(-100)));
      } catch {
        // private window: remembered for this visit only
      }
    });
  }, []);

  if (notes.length === 0) return null;
  const dismiss = (id: string) => setNotes((n) => n.filter((x) => x.id !== id));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-2">
      {notes.map((n) => (
        <div key={n.id} className="glass pop-in flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl">
          <MessageSquare size={16} className="mt-0.5 shrink-0 text-blue-300" />
          <Link href={`/clients/${n.slug}`} onClick={() => dismiss(n.id)} className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {n.from ? `${n.from} (${n.client})` : n.client} sent a message
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.message}</p>
          </Link>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            aria-label="Dismiss"
            className="btn-ghost -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
