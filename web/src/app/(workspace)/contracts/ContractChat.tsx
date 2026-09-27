"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, PenLine, RotateCcw, Sparkles } from "lucide-react";
import { runs } from "@/lib/contract";
import type { ChatMessage } from "./assistant";

// Claude, under the form: for anything the form doesn't cover — a clause,
// different wording, a special term. What's typed into a form field's own
// box lands here too, tagged with the field it came from.

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

export function Avatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
      <Sparkles size={13} />
    </span>
  );
}

// A question Claude asks back when something's unclear: options to pick,
// or type anything
function QuestionCard({ question, options, live, onAnswer }: { question: string; options: string[]; live: boolean; onAnswer: (a: string) => void }) {
  const [own, setOwn] = useState("");
  if (!live) return <p className="mt-2 rounded-xl border border-white/[0.05] px-3.5 py-2.5 text-[13px] text-muted">{question}</p>;
  return (
    <div className="fade-in mt-2 overflow-hidden rounded-2xl border border-accent/20 bg-accent/[0.04]">
      <p className="px-4 pb-2 pt-3.5 text-[13.5px] font-medium leading-snug text-foreground">{question}</p>
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            onClick={() => onAnswer(o)}
            className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13.5px] text-foreground/85 transition-colors hover:bg-accent/10 hover:text-foreground"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-accent/25 text-[11px] tabular-nums text-accent transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-[#0b1215]">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{o}</span>
            <ArrowRight size={14} className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (own.trim()) onAnswer(own);
          }}
          className="mt-1 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-2/70 py-1 pl-3 pr-1 transition-colors focus-within:border-accent/40"
        >
          <PenLine size={13} className="shrink-0 text-muted" />
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Type your own answer…" className="min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] outline-none! placeholder:text-muted/70" />
          <button type="submit" disabled={!own.trim()} aria-label="Send" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[#0b1215] transition-opacity disabled:opacity-25">
            <ArrowUp size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

export function ContractChat({
  chat,
  thinking,
  error,
  locked,
  onSend,
  onClear,
}: {
  chat: ChatMessage[];
  thinking: boolean;
  error: string | null;
  locked: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat, thinking, error]);

  const send = (text: string) => {
    if (!text.trim() || thinking) return;
    setDraft("");
    onSend(text);
  };
  const last = chat[chat.length - 1];
  const pending = !locked && !thinking && last?.role === "assistant" && !!last.question && !!last.options?.length;
  const ideas = locked ? ["Summarise this contract"] : ["Add a confidentiality clause", "Summarise this contract", "Add a 10% discount for month one"];

  return (
    <div className="flex h-[440px] flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface/90 to-surface/50">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Ask Claude</p>
          <p className="text-xs text-muted">Anything the form doesn&apos;t cover — clauses, wording, special terms</p>
        </div>
        {chat.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="Clear the conversation (the contract stays as it is)"
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
        {chat.length === 0 && !thinking && (
          <div className="flex gap-3">
            <Avatar />
            <p className="pt-0.5 text-foreground/80">
              {locked
                ? "This contract has gone out for signature, so it can't change now. You can still ask me about it."
                : "Tell me anything to add or change — I'll edit the contract and it updates on the right."}
            </p>
          </div>
        )}
        {chat.map((m, i) => {
          if (m.role === "user") {
            // from a form field's box: [Monthly fee] 2500 AED
            const field = m.text.match(/^\[([^\]]+)\]\s*/);
            return (
              <div key={i} className="fade-in flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-accent/20 bg-accent/[0.1] px-3.5 py-2 text-foreground">
                  {field && <span className="mb-0.5 block text-[11px] text-accent">{field[1]}</span>}
                  {field ? m.text.slice(field[0].length) : m.text}
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="fade-in flex gap-3">
              <Avatar />
              <div className="min-w-0 flex-1 pt-0.5 text-foreground/85">
                {m.text && <Text text={m.text} />}
                {m.question && m.options?.length ? <QuestionCard question={m.question} options={m.options} live={pending && i === chat.length - 1} onAnswer={send} /> : null}
              </div>
            </div>
          );
        })}
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

      {!pending && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {!draft && !thinking && chat.length === 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {ideas.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="shrink-0 rounded-full border border-accent/25 px-3 py-1 text-xs text-accent/90 transition-colors hover:bg-accent/10">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-surface-2/80 p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent/40 focus-within:shadow-[0_0_0_4px_rgba(111,179,189,0.1)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder={locked ? "Ask about this contract…" : "Add or change anything…"}
              className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none! placeholder:text-muted/70"
            />
            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || thinking}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-[#0b1215] transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
