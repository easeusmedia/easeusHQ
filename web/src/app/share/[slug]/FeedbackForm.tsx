"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { sendClientFeedback } from "../actions";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted";

export function FeedbackForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<{ sending?: boolean; error?: string; sent?: boolean }>({});

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ sending: true });
    const res = await sendClientFeedback(slug, { name, message, trap });
    if (res.error) return setState({ error: res.error });
    setMessage("");
    setState({ sent: true });
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" maxLength={80} className={field} />
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (state.sent || state.error) setState({});
        }}
        placeholder="Thoughts on a cut, something to add, anything you'd like us to change…"
        rows={4}
        maxLength={2000}
        required
        className={field}
      />
      {/* only a bot fills this in — hidden from people and screen readers */}
      <input value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state.sending} className="btn-glow flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
          <Send size={14} /> {state.sending ? "Sending…" : "Send to the team"}
        </button>
        {state.sent && <span className="text-sm text-green-300">Thanks — the team will see this.</span>}
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}
