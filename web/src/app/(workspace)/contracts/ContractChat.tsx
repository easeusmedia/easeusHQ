"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { opener, runs, type Clause, type ContractDetails } from "@/lib/contract";
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
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
      <Sparkles size={13} />
    </span>
  );
}

export function ContractChat({
  id,
  initial,
  details,
  missing,
  locked,
  onUpdate,
}: {
  id: string;
  initial: ChatMessage[];
  details: ContractDetails;
  missing: { key: string; label: string }[];
  locked: boolean;
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

  // the opening message is fixed — the first of the assistant's questions —
  // until the conversation starts, when it's saved as part of it
  const intro = locked ? "This contract has gone out for signature, so it can't change now. You can still ask me about it." : opener(details, missing.length);

  // quick answers to the first question, then a few ideas once it's complete
  const ideas = locked
    ? ["Summarise this contract"]
    : chat.length === 0 && details.termMonths == null
      ? ["One-month trial", "3 months", "6 months"]
      : missing.length === 0
        ? ["Add a confidentiality clause", "Make the payment a 50/50 split", "Summarise this contract"]
        : [];

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
        {/* until the saved conversation carries the opener itself */}
        {(chat[0]?.role !== "assistant" || locked) && (
          <div className="flex gap-3">
            <Avatar />
            <div className="min-w-0 pt-0.5 text-foreground/85">
              <Text text={intro} />
            </div>
          </div>
        )}
        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="fade-in flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-accent/20 bg-accent/[0.1] px-3.5 py-2 text-foreground">
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
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-accent/70" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
        {error && <p className="fade-in rounded-xl border border-accent/25 bg-accent/[0.08] px-3.5 py-2 text-foreground/85">{error}</p>}
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {!draft && !thinking && ideas.length > 0 && (
          <div className="fade-in flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {ideas.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="shrink-0 rounded-full border border-accent/25 px-3 py-1 text-xs text-accent/90 transition-colors hover:bg-accent/10"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-surface-2/80 p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent/40 focus-within:shadow-[0_0_0_4px_rgba(111,179,189,0.1)]">
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
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-[#0b1215] transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
