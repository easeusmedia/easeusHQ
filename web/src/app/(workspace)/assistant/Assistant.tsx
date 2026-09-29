"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Maximize2, Minimize2, Sparkles, SquarePen, X } from "lucide-react";
import { ask, confirmProposal } from "./actions";
import type { Proposal } from "./proposals";

type Msg = {
  role: "user" | "assistant";
  text: string;
  proposals?: Proposal[];
  // per proposal: done, dismissed, or what went wrong
  outcome?: Record<number, string>;
  // what answering it took: model, calls, tokens each way, dollars, time
  usage?: { model: string; calls: number; input: number; output: number; cost: number; ms: number };
  error?: boolean;
};

const KEY = "hq.assistant.v1";
const POS_KEY = "hq.nyra.position";

// While we weigh up what asking Claude costs, each answer shows its tokens
// and price, and the header the chat's total. Set to false (or delete what
// it guards) once testing's done: the admin needn't see any of it.
const SHOW_USAGE = true;
const tokens = (n: number) => n.toLocaleString("en-IN");
// each worded to match what's looked up before Nyra is asked (lib/assistant
// TOPICS), so every one is answered in a single call
const SUGGESTIONS = ["What needs my attention today?", "Who's got the most on their plate?", "How are the editors performing?", "How are we doing for money?"];

const partOfDay = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

// Nyra's mark: sparkles, in the accent
function Mark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
      <Sparkles size={14} />
    </span>
  );
}
const EASE = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

// **bold** inside a line
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}

// Just the markdown Nyra writes back: paragraphs, lists, headings, tables.
function Answer({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      out.push(
        <div key={i} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? "text-muted" : "border-t border-border/60"}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2.5 py-1.5">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const bullet = line.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const items: string[] = [];
      while (i < lines.length && /^([-*•]|\d+\.)\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^([-*•]|\d+\.)\s+/, ""));
      i--;
      out.push(
        <ul key={i} className="flex flex-col gap-1 pl-1">
          {items.map((it, k) => (
            <li key={k} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
              <span>
                <Inline text={it} />
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    out.push(
      <p key={i} className={heading ? "font-semibold" : ""}>
        <Inline text={heading ? heading[1] : line} />
      </p>
    );
  }
  return <div className="flex flex-col gap-2">{out}</div>;
}

// Nyra, the admin's assistant (Claude underneath): a button at the bottom
// right (or ⌘J) opens a panel
// over the page, which can go full screen. Answers come from Easeus HQ's
// own data; anything it wants to change waits for Confirm.
export function Assistant({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // where the launcher sits: its distance from the bottom-right corner,
  // null for the default; dragged there, and remembered in this browser
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const launcher = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const landed = useRef<{ right: number; bottom: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // the conversation survives a reload, in this browser only
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring what this browser kept, once
      if (raw) setMsgs(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40)));
    } catch {}
  }, [msgs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // back where it was left, kept on screen if the window is smaller now
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring where this browser left it, once
      if (saved) setPos({ right: Math.min(saved.right, window.innerWidth - 80), bottom: Math.min(saved.bottom, window.innerHeight - 50) });
    } catch {}
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    const r = launcher.current!.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // a few pixels of wobble is still a click
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const r = launcher.current!.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.max(8, Math.min(v, max));
    landed.current = { right: clamp(d.right - dx, window.innerWidth - r.width - 8), bottom: clamp(d.bottom - dy, window.innerHeight - r.height - 8) };
    setPos(landed.current);
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    // the click that follows a drag isn't a click
    dragged.current = true;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(landed.current));
    } catch {}
  }

  // braces, not an arrow's value: scrollIntoView returns a promise in newer
  // browsers, and an effect that returns anything but a function breaks React
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    // what Claude sees of the past: the words, and which changes went through
    const history = msgs
      .filter((m) => !m.error)
      .map((m) => ({
        role: m.role,
        text: m.proposals?.length
          ? `${m.text}\n${m.proposals.map((p, i) => `[${p.title}: ${m.outcome?.[i] === "done" ? "confirmed" : m.outcome?.[i] === "dismissed" ? "dismissed" : "not confirmed"}]`).join(" ")}`
          : m.text,
      }));
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "";
    setBusy(true);
    const res = await ask(history, q).catch(() => ({ error: "Couldn't reach Nyra. Please try again." }) as Awaited<ReturnType<typeof ask>>);
    setBusy(false);
    if (res.error) return setMsgs((m) => [...m, { role: "assistant", text: res.error!, error: true }]);
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: res.text ?? "",
        proposals: res.proposals,
        usage: res.usage && { model: res.model?.includes("haiku") ? "Haiku" : "Sonnet", cost: res.cost ?? 0, ...res.usage },
      },
    ]);
  }

  // the chat so far, for the header while SHOW_USAGE is on
  const chat = msgs.reduce((t, m) => (m.usage ? { tokens: t.tokens + m.usage.input + m.usage.output, cost: t.cost + m.usage.cost } : t), { tokens: 0, cost: 0 });

  async function decide(mi: number, pi: number, go: boolean) {
    const setOutcome = (v: string) => setMsgs((m) => m.map((x, i) => (i === mi ? { ...x, outcome: { ...x.outcome, [pi]: v } } : x)));
    if (!go) return setOutcome("dismissed");
    setOutcome("working");
    const res = await confirmProposal(msgs[mi].proposals![pi]);
    setOutcome(res.error ?? "done");
    if (!res.error) router.refresh();
  }

  return (
    <>
      {/* the light round the edge lives on the wrapper, behind the button */}
      <span
        ref={launcher}
        style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
        className={`nyra-glow fixed bottom-5 right-5 z-40 transition-[opacity,translate] ${EASE} ${open ? "pointer-events-none translate-y-2 opacity-0" : ""}`}
      >
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            setOpen(true);
          }}
          title="Ask Nyra (drag to move)"
          className="group flex touch-none select-none items-center gap-2 rounded-full bg-surface-2 px-3.5 py-2.5 text-sm shadow-xl transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97] active:cursor-grabbing"
        >
          <Sparkles size={15} className="shrink-0 text-accent transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <span className="hidden sm:inline">Ask Nyra</span>
          <kbd className="hidden rounded bg-surface px-1 text-[10px] text-muted sm:inline">⌘J</kbd>
        </button>
      </span>

      <div
        onClick={() => setFull(false)}
        className={`fixed inset-0 z-40 bg-black/25 transition-opacity ${EASE} ${open && full ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        aria-label="Nyra"
        inert={!open}
        className={`glass-panel fixed z-50 flex flex-col overflow-hidden rounded-2xl transition-all ${EASE} ${
          full ? "inset-3 md:inset-10" : "bottom-3 right-3 top-3 w-[min(27rem,calc(100vw-1.5rem))]"
        } ${open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-10 opacity-0"}`}
      >
        <header className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <Mark />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Nyra</p>
            <p className="truncate text-[11px] text-muted">
              {/* while testing: this chat's running total (see SHOW_USAGE) */}
              {SHOW_USAGE && chat.cost > 0 ? `This chat: ${tokens(chat.tokens)} tokens · $${chat.cost.toFixed(4)}` : "Here to help"}
            </p>
          </div>
          {[
            { label: "New chat", Icon: SquarePen, on: () => setMsgs([]), show: msgs.length > 0 },
            { label: full ? "Side panel" : "Full screen", Icon: full ? Minimize2 : Maximize2, on: () => setFull((f) => !f), show: true },
            { label: "Close", Icon: X, on: () => setOpen(false), show: true },
          ]
            .filter((b) => b.show)
            .map(({ label, Icon, on }) => (
              <button key={label} onClick={on} aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
                <Icon size={15} />
              </button>
            ))}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto flex flex-col gap-5 px-4 py-5 text-sm leading-relaxed ${full ? "max-w-3xl" : ""}`}>
            {msgs.length === 0 && (
              <div className="fade-in flex flex-col gap-4">
                <div>
                  {/* the hour is the browser's, not the server's */}
                  <p className="text-base font-semibold" suppressHydrationWarning>
                    {partOfDay()}, {name}.
                  </p>
                  <p className="mt-1 text-sm text-muted">Hand me the chaos; I&apos;ll bring back a plan.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.07]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, mi) =>
              m.role === "user" ? (
                <div key={mi} className="fade-in ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2">
                  {m.text}
                </div>
              ) : (
                <div key={mi} className="fade-in flex flex-col gap-2">
                  {m.error ? <p className="text-red-300">{m.text}</p> : m.text && <Answer text={m.text} />}
                  {m.proposals?.map((p, pi) => {
                    const outcome = m.outcome?.[pi];
                    return (
                      <div key={pi} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                        <p className="text-[11px] text-muted">Change to confirm</p>
                        <p className="font-medium">{p.title}</p>
                        <dl className="mt-2 flex flex-col gap-1 text-xs">
                          {p.lines.map((l) => (
                            <div key={l.field} className="flex gap-2">
                              <dt className="w-20 shrink-0 text-muted">{l.field}</dt>
                              <dd className="min-w-0">
                                {l.from && <span className="text-muted line-through decoration-muted/50">{l.from}</span>}
                                {l.from && <span className="text-muted"> → </span>}
                                <span>{l.to}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          {outcome === "done" ? (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Check size={12} /> Done
                            </span>
                          ) : outcome === "dismissed" ? (
                            <span className="text-xs text-muted">Dismissed</span>
                          ) : (
                            <>
                              {outcome && outcome !== "working" && <span className="mr-auto text-xs text-red-300">{outcome}</span>}
                              <button onClick={() => decide(mi, pi, false)} disabled={outcome === "working"} className="btn btn-xs btn-ghost">
                                Dismiss
                              </button>
                              <button onClick={() => decide(mi, pi, true)} disabled={outcome === "working"} className="btn btn-xs btn-glow disabled:opacity-60">
                                {outcome === "working" ? "Saving…" : "Confirm"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {SHOW_USAGE && m.usage && (
                    <p className="text-[10px] tabular-nums text-muted/70">
                      {m.usage.model} · {m.usage.calls} call{m.usage.calls === 1 ? "" : "s"} · {tokens(m.usage.input)} tokens in, {tokens(m.usage.output)} out · $
                      {m.usage.cost.toFixed(4)} · {(m.usage.ms / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              )
            )}

            {busy && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
                <span className="ml-1">Nyra is looking into it</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-white/[0.06] p-3"
        >
          <div className={`mx-auto flex items-end gap-2 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-white/20 ${full ? "max-w-3xl" : ""}`}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about the dashboard…"
              className="max-h-32 flex-1 resize-none bg-transparent py-0.5 text-sm outline-none! placeholder:text-muted"
            />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Send" className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-40">
              <ArrowUp size={14} />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
