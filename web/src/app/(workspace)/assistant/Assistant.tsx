"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Maximize2, Minimize2, Sparkles, SquarePen, X } from "lucide-react";
import { ask, assistantUsage, confirmProposal } from "./actions";
import type { Proposal } from "./proposals";

type Msg = {
  role: "user" | "assistant";
  text: string;
  proposals?: Proposal[];
  // per proposal: done, dismissed, or what went wrong
  outcome?: Record<number, string>;
  meta?: string;
  error?: boolean;
};

const KEY = "hq.assistant.v1";
const SUGGESTIONS = ["What is everyone working on?", "Who has the most pending work?", "How did the editors do this month?", "What's the financial status?"];
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

// Just the markdown Claude writes back: paragraphs, lists, headings, tables.
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

// The admin's assistant: a button at the bottom right (or ⌘J) opens a panel
// over the page, which can go full screen. Answers come from Easeus HQ's
// own data; anything it wants to change waits for Confirm.
export function Assistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState<{ spent: number; budget: number } | null>(null);
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
    if (!open) return;
    inputRef.current?.focus();
    if (!spend) assistantUsage().then((s) => s && setSpend(s));
  }, [open, spend]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, busy]);

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
    const res = await ask(history, q).catch(() => ({ error: "Couldn't reach the assistant. Please try again." }) as Awaited<ReturnType<typeof ask>>);
    setBusy(false);
    if (res.error) return setMsgs((m) => [...m, { role: "assistant", text: res.error!, error: true }]);
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: res.text ?? "",
        proposals: res.proposals,
        meta: `${res.model?.includes("haiku") ? "Haiku" : "Sonnet"} · $${(res.cost ?? 0).toFixed(3)}`,
      },
    ]);
    if (res.spent !== undefined && res.budget !== undefined) setSpend({ spent: res.spent, budget: res.budget });
  }

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
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border bg-surface-2/90 px-3.5 py-2.5 text-sm shadow-xl backdrop-blur transition-[opacity,translate,border-color] ${EASE} hover:border-hover ${
          open ? "pointer-events-none translate-y-2 opacity-0" : ""
        }`}
      >
        <Sparkles size={15} className="text-accent" />
        <span className="hidden sm:inline">Ask Claude</span>
        <kbd className="hidden rounded bg-surface px-1 text-[10px] text-muted sm:inline">⌘J</kbd>
      </button>

      <div
        onClick={() => setFull(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity ${EASE} ${open && full ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        aria-label="Claude"
        inert={!open}
        className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl transition-all ${EASE} ${
          full ? "inset-3 md:inset-10" : "bottom-3 right-3 top-3 w-[min(27rem,calc(100vw-1.5rem))]"
        } ${open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-10 opacity-0"}`}
      >
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Claude</p>
            <p className="truncate text-[11px] text-muted">
              {spend ? `$${spend.spent.toFixed(2)} of $${spend.budget.toFixed(2)} used this month` : "Your Easeus HQ assistant"}
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
              <div className="fade-in flex flex-col gap-4 pt-6">
                <div>
                  <p className="text-base font-semibold">What would you like to know?</p>
                  <p className="mt-1 text-xs text-muted">Ask about anyone&apos;s work, a client, performance or money. I only see what&apos;s in Easeus HQ, and I ask before changing anything.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-2">
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
                      <div key={pi} className="rounded-xl border border-border bg-surface-2/40 p-3">
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
                  {m.meta && <p className="text-[10px] text-muted/60">{m.meta}</p>}
                </div>
              )
            )}

            {busy && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
                <span className="ml-1">Looking it up</span>
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
          className="border-t border-border p-3"
        >
          <div className={`mx-auto flex items-end gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 transition-colors focus-within:border-hover ${full ? "max-w-3xl" : ""}`}>
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
