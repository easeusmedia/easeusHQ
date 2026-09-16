"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markClientFeedbackRead } from "./actions";

type Item = { id: string; name: string | null; message: string; createdAt: string; unread: boolean };

// What the client has sent from their shared page, newest first.
export function ClientFeedbackList({ clientId, items }: { clientId: string; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const unread = items.filter((i) => i.unread).length;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium">From the client</h2>
        {unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">{unread} new</span>}
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await markClientFeedbackRead(clientId); router.refresh(); })}
            className="ml-auto text-xs text-muted hover:text-foreground disabled:opacity-60"
          >
            Mark as read
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className={`rounded-xl border px-4 py-3 ${i.unread ? "border-blue-400/30 bg-blue-400/5" : "border-border/60 bg-surface-2/40"}`}>
            <p className="whitespace-pre-wrap text-sm">{i.message}</p>
            <p className="mt-1 text-xs text-muted">
              {i.name ?? "Client"} · {new Date(i.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
