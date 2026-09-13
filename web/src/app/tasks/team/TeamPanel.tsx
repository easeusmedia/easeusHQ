"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, X } from "lucide-react";
import { Avatar } from "../TaskCard";
import { getThreadMessages, sendMessage, type ThreadMessage } from "./actions";
import { ACTIVE_WINDOW_MS } from "./constants";

type Person = { id: string; name: string; role: string; avatarUrl: string | null; lastSeenAt: Date | null };

function isActive(p: Person) {
  return !!p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
}

function Face({ person, size }: { person: Person; size: number }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={person.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={person.name} size={size} />
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${
        active ? "bg-green-400" : "bg-muted"
      }`}
    />
  );
}

function timeLabel(d: Date) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// The right-side panel opened from the header's stacked avatars: a roster
// of the team with a live-ish status dot, drilling into a plain 1:1 thread
// with whoever you pick. Polls its own thread every few seconds while
// open — same "cheap stand-in for real-time" approach as LiveRefresh, just
// scoped to this one panel instead of the whole page.
export function TeamPanel({ people, meId, onClose }: { people: Person[]; meId: string; onClose: () => void }) {
  const [openWith, setOpenWith] = useState<Person | null>(null);
  const roster = people.filter((p) => p.id !== meId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-[22rem] max-w-[90vw] flex-col border-l border-border bg-surface">
        {openWith ? (
          <Thread person={openWith} meId={meId} onBack={() => setOpenWith(null)} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <h2 className="text-sm font-semibold">Team</h2>
              <button onClick={onClose} className="btn-ghost rounded-md p-1.5">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {roster.map((p) => {
                const active = isActive(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => setOpenWith(p)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="relative shrink-0">
                      <Face person={p} size={34} />
                      <StatusDot active={active} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted">{active ? "Active now" : "Away"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Thread({ person, meId, onBack, onClose }: { person: Person; meId: string; onBack: () => void; onClose: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function load() {
    const msgs = await getThreadMessages(person.id);
    setMessages(msgs);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount-and-poll, same shape as LiveRefresh; there's no external-system subscription to hang this off of instead
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over `person.id` only, re-created each render is fine for a poll
  }, [person.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    const res = await sendMessage(person.id, body);
    setSending(false);
    if (res.error) return; // rare (empty/signed-out) — the draft is already cleared, not worth a whole error UI for a DM box
    load();
  }

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
        <button onClick={onBack} className="btn-ghost shrink-0 rounded-md p-1.5">
          <ArrowLeft size={16} />
        </button>
        <Face person={person} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
        <button onClick={onClose} className="btn-ghost shrink-0 rounded-md p-1.5">
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const mine = m.fromId === meId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-blue-500/20 text-foreground" : "bg-surface-2 text-foreground"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-muted">{timeLabel(m.createdAt)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message ${person.name.split(" ")[0]}…`}
          className="flex-1 rounded-full border border-border bg-surface-2 px-3.5 py-2 text-sm text-foreground"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="btn-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </>
  );
}
