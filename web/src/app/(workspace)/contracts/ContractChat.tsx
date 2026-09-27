"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { runs, type Clause, type ContractDetails } from "@/lib/contract";
import { chatContract, clearContractChat } from "./actions";
import type { ChatMessage } from "./assistant";

// Talking the contract into shape: say what should change — a figure, a
// clause, the whole structure — and Claude changes it; the page beside this
// redraws with every reply.

function Text({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l, i) => {
        const bullet = /^\s*[-•*]\s+/.test(l);
        const body = l.replace(/^\s*[-•*]\s+/, "");
        return (
          <p key={i} className={bullet ? "relative pl-4 before:absolute before:left-1 before:top-[0.6em] before:size-1 before:rounded-full before:bg-current before:opacity-50" : ""}>
            {runs(body).map((r, j) => (
              <span key={j} className={r.bold ? "font-medium text-foreground" : r.italic ? "italic" : ""}>
                {r.text}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400/90 via-fuchsia-400/80 to-sky-400/90 text-white shadow-[0_0_20px_-4px_rgba(167,139,250,0.6)]">
      <Sparkles size={13} />
    </span>
  );
}

export function ContractChat({
  id,
  initial,
  missing,
  locked,
  who,
  onUpdate,
}: {
  id: string;
  initial: ChatMessage[];
  missing: { key: string; label: string }[];
  locked: boolean;
  who: string;
  onUpdate: (next: { details: ContractDetails; clauses: Clause[]; status: string }) => void;
}) {
  const [chat, setChat] = useState(initial);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat, thinking, error]);

  async function send(text = draft) {
    const t = text.trim();
    if (!t || thinking) return;
    setDraft("");
    setError(null);
    setChat((c) => [...c, { role: "user", text: t, at: new Date().toISOString() }]);
    setThinking(true);
    const res = await chatContract(id, t);
    setThinking(false);
    if (res.error) return setError(res.error);
    if (res.chat) setChat(res.chat);
    if (res.details && res.clauses && res.status) onUpdate({ details: res.details, clauses: res.clauses, status: res.status });
  }

  function suggest(text: string) {
    setDraft(text);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(text.length, text.length);
    });
  }

  // the opening line isn't Claude's — it's what the contract needs, said plainly
  const intro = locked
    ? "This contract has gone out for signature, so it can't change now. You can still ask me about it."
    : missing.length
      ? `I've drafted this from ${who}'s details. To finish it I still need: **${missing.map((m) => m.label.toLowerCase()).join(", ")}**. Tell me in your own words — e.g. “£2,500 a month for 3 months, 2 long-form episodes and 4 reels per episode, on YouTube and Instagram.”`
      : "It's complete and ready for your review. Ask me to change anything — a figure, a clause, the whole structure — or to add something new.";

  const ideas = locked
    ? ["Summarise this contract"]
    : [
        ...missing.slice(0, 4).map((m) => `${m.label}: `),
        ...(missing.length ? [] : ["Add a confidentiality clause", "Make the payment a 50/50 split", "Summarise this contract"]),
      ];

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface/90 to-surface/50 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Contract assistant</p>
          <p className="text-xs text-muted">Tell me what to change — I&apos;ll edit the contract</p>
        </div>
        {chat.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              await clearContractChat(id);
              setChat([]);
              setError(null);
            }}
            title="Start a new conversation (the contract stays as it is)"
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
        <div className="flex gap-3">
          <Avatar />
          <div className="min-w-0 pt-0.5 text-foreground/85">
            <Text text={intro} />
          </div>
        </div>
        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="fade-in flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-white/[0.08] bg-gradient-to-br from-sky-500/[0.16] to-violet-500/[0.16] px-3.5 py-2 text-foreground">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="fade-in flex gap-3">
              <Avatar />
              <div className="min-w-0 pt-0.5 text-foreground/85">
                <Text text={m.text} />
              </div>
            </div>
          )
        )}
        {thinking && (
          <div className="fade-in flex items-center gap-3">
            <Avatar />
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-violet-300/70" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
        {error && <p className="fade-in rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3.5 py-2 text-red-200">{error}</p>}
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {!draft && !thinking && ideas.length > 0 && (
          <div className="fade-in flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {ideas.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => (s.endsWith(": ") ? suggest(s) : send(s))}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                  s.endsWith(": ")
                    ? "border-amber-400/30 text-amber-200 hover:bg-amber-400/10"
                    : "border-white/[0.08] text-muted hover:border-white/20 hover:text-foreground"
                }`}
              >
                {s.endsWith(": ") ? s.slice(0, -2) : s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-surface-2/80 p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-violet-400/40 focus-within:shadow-[0_0_0_4px_rgba(167,139,250,0.08)]">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={locked ? "Ask about this contract…" : "Change anything — terms, clauses, wording…"}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none! placeholder:text-muted/70"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!draft.trim() || thinking}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-sky-400 text-white transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
