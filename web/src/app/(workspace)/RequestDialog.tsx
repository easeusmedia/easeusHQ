"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { closeOnBackdrop } from "./dialog";
import { sendRequest } from "./requests";

// Ask for something from whoever handles it: pick what it's about (a role
// that takes requests), say what you need, send. From the profile menu.
export function RequestDialog({ open, onClose, types }: { open: boolean; onClose: () => void; types: { id: string; name: string }[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setRoleId] = useState(types[0]?.id ?? "");
  // the one picked, while it's still on offer
  const roleId = types.some((t) => t.id === picked) ? picked : (types[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setText("");
      setError(null);
      setBusy(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await sendRequest(roleId, text).catch(() => ({ error: "That couldn't be sent. Check your connection and try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    onClose();
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={() => open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <h2 className="text-base font-semibold">Request</h2>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button key={t.id} type="button" aria-pressed={roleId === t.id} onClick={() => setRoleId(t.id)} className="chip rounded-full px-3 py-1 text-xs font-medium">
              {t.name}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          rows={3}
          maxLength={300}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need?"
          className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-hover disabled:opacity-60"
        />
        {error && (
          <p role="alert" className="fade-in text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy || !text.trim() || !roleId} className="btn btn-glow disabled:opacity-50">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
