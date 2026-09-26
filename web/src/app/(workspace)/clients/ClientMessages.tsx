"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { markClientFeedbackRead } from "./actions";

type Item = { id: string; name: string | null; message: string; createdAt: string; unread: boolean };

// What the client has sent from their shared page, behind one button in the
// page's top-right corner, so the overview stays about the work. Opening it
// marks everything read; what was new stays highlighted while it's open.
export function ClientMessages({ clientId, items }: { clientId: string; items: Item[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [, start] = useTransition();
  const unread = items.filter((i) => i.unread).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    const ids = items.filter((i) => i.unread).map((i) => i.id);
    setFresh(ids);
    if (ids.length) {
      start(async () => {
        await markClientFeedbackRead(clientId);
        router.refresh();
      });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} className="btn btn-sm btn-glow">
        <MessageSquare size={13} />
        Messages
        {unread > 0 && (
          <span className="rounded-full bg-blue-400/20 px-1.5 text-[11px] font-medium leading-4 text-blue-200">{unread}</span>
        )}
      </button>
      {open && (
        <div className="pop-in absolute right-0 top-full z-30 mt-1.5 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface-2 shadow-xl">
          <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted">From the client</p>
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted">No messages yet.</li>
            ) : (
              items.map((i) => (
                <li key={i.id} className={`rounded-lg px-3 py-2.5 ${fresh.includes(i.id) ? "bg-blue-400/[0.07]" : ""}`}>
                  <p className="whitespace-pre-wrap break-words text-sm">{i.message}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    {fresh.includes(i.id) && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-label="New" />}
                    {i.name ?? "Client"} ·{" "}
                    {new Date(i.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
