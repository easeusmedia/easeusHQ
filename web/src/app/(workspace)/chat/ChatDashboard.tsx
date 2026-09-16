"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Send } from "lucide-react";
import { Avatar } from "../TaskCard";
import { getThreadMessages, sendMessage, type ThreadMessage } from "../presence/actions";
import { ACTIVE_WINDOW_MS } from "../presence/constants";

export type ChatPerson = {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
};

function isActive(p: ChatPerson) {
  return !!p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
}

function Face({ person, size }: { person: ChatPerson; size: number }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={person.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={person.name} size={size} />
  );
}

// "4m", "3h", "2d" — a conversation list wants elapsed time at a glance,
// not a formatted timestamp on every row.
function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

// two messages close enough in time to read as one turn rather than two
const RUN_GAP_MS = 5 * 60 * 1000;
function within(a: Date | string, b: Date | string) {
  return new Date(b).getTime() - new Date(a).getTime() < RUN_GAP_MS;
}

function timeLabel(d: Date | string) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(d: Date | string) {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yest)) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// The team's own chat, as a full page rather than a slide-over panel:
// conversations down the left, the open thread filling the rest. Replaces
// the avatar stack that used to float over the bottom-right corner of
// every other page.
export function ChatDashboard({ people, meId }: { people: ChatPerson[]; meId: string }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(people.find((p) => p.unread > 0)?.id ?? people[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const open = people.find((p) => p.id === openId) ?? null;
  const filtered = people.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    async function load() {
      const msgs = await getThreadMessages(openId!);
      if (!cancelled) setMessages(msgs);
    }
    // same cheap poll as the old panel's thread — no websockets wired up,
    // and an 8s tick on one open conversation is nothing
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [openId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !openId) return;
    setSending(true);
    setDraft("");
    const res = await sendMessage(openId, body);
    setSending(false);
    if (res.error) return;
    setMessages(await getThreadMessages(openId));
    router.refresh(); // keeps the conversation list's previews/badges current
  }

  return (
    // h-full, not a 100vh calc: this sits inside the layout's padded,
    // full-height scroll pane, so 100vh minus a guessed padding overshot by
    // exactly that padding and cropped the composer off the bottom.
    <div className="flex h-full gap-4">
      {/* conversations */}
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {filtered.map((p) => {
            const selected = p.id === openId;
            return (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className={`flex w-full shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left ${
                  selected ? "bg-surface-2" : "hover:bg-surface-2/60"
                }`}
              >
                <span className="relative shrink-0">
                  <Face person={p} size={38} />
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${
                      isActive(p) ? "bg-green-400" : "bg-muted"
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${p.unread > 0 ? "font-semibold" : "font-medium"}`}>{p.name}</span>
                    {p.lastAt && <span className="shrink-0 text-xs text-muted">{ago(p.lastAt)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${p.unread > 0 ? "text-foreground" : "text-muted"}`}>
                      {p.lastBody ? `${p.lastFromMe ? "You: " : ""}${p.lastBody}` : isActive(p) ? "Active now" : "No messages yet"}
                    </span>
                    {p.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                        {p.unread > 9 ? "9+" : p.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">Nobody by that name.</p>}
        </div>
      </aside>

      {/* thread */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
        {open ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <Face person={open} size={34} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{open.name}</p>
                <p className="text-xs text-muted">{isActive(open) ? "Active now" : "Away"}</p>
              </div>
              <span className="ml-auto rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs capitalize text-muted">
                {open.role}
              </span>
            </header>

            <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
              {messages === null ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : messages.length === 0 ? (
                <p className="m-auto text-sm text-muted">No messages yet — say hello.</p>
              ) : (
                messages.map((m, i) => {
                  const mine = m.fromId === meId;
                  const prev = messages[i - 1];
                  const next = messages[i + 1];
                  // a date separator whenever the day changes, so a thread
                  // spanning weeks doesn't read as one undifferentiated run
                  const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                  // Consecutive messages from the same person within a few
                  // minutes are one run: they sit tight together and only the
                  // last of them carries a timestamp. A time under every
                  // single bubble was what made short back-and-forth ("hi",
                  // "yes", "yesss?") sprawl down the whole pane.
                  const startsRun = showDay || !prev || prev.fromId !== m.fromId || !within(prev.createdAt, m.createdAt);
                  const endsRun = !next || next.fromId !== m.fromId || !within(m.createdAt, next.createdAt)
                    || dayLabel(next.createdAt) !== dayLabel(m.createdAt);
                  return (
                    <div key={m.id} className={startsRun && !showDay ? "mt-3" : undefined}>
                      {showDay && (
                        <div className="my-4 flex items-center gap-3">
                          <span className="h-px flex-1 bg-border" />
                          <span className="text-xs text-muted">{dayLabel(m.createdAt)}</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${startsRun ? "" : "mt-0.5"}`}>
                        <div
                          className={`max-w-[68%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                            mine ? "bg-blue-600 text-white" : "bg-surface-2 text-foreground"
                          } ${endsRun ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""}`}
                        >
                          {m.body}
                        </div>
                        {endsRun && <span className="mt-1 px-1 text-xs text-muted">{timeLabel(m.createdAt)}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={`Message ${open.name.split(" ")[0]}…`}
                className="min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <p className="m-auto text-sm text-muted">Pick someone to start a conversation.</p>
        )}
      </section>
    </div>
  );
}
