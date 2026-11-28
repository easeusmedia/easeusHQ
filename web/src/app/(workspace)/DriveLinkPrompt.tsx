"use client";

import { useRef, useState } from "react";
import { linkProblem, pickLink } from "@/lib/links";
import { stageLabel } from "@/lib/stages";
import { closeOnBackdrop } from "./dialog";
import { tickTask, tickToClient, type TaskFormState } from "./actions";

type To = "delivered" | "client";
const FIELD: Record<To, { stage: "delivered_and_uploaded" | "sent_for_client_approval"; label: string; example: string }> = {
  delivered: { stage: "delivered_and_uploaded", label: "Final Drive link", example: "https://drive.google.com/…" },
  client: { stage: "sent_for_client_approval", label: "Frame.io link", example: "https://f.io/…" },
};
const OFFLINE = "That didn't go through. Check your connection and try again.";

// A production task ticked off with no final Drive link (Home, My tasks):
// asks for it there, as the Board does on delivery (StatusSelect), and stays
// open until the move goes through. One the client hasn't seen yet can go to
// them for approval instead, with its Frame.io link (Abhishek, 28 Nov 2026).
// ask resolves to where it went, or null when cancelled.
export function useDriveLinkPrompt() {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useRef<((to: To | null) => void) | null>(null);
  const [task, setTask] = useState<{ id: string; toClient: boolean } | null>(null);
  const [to, setTo] = useState<To>("delivered");
  const [values, setValues] = useState<Record<To, string>>({ delivered: "", client: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function ask(id: string, offer: NonNullable<TaskFormState["needsDriveLink"]>) {
    setTask({ id, toClient: offer.toClient });
    setTo("delivered");
    setValues({ delivered: "", client: offer.frameioLink ?? "" });
    setError(null);
    ref.current?.showModal();
    return new Promise<To | null>((resolve) => (done.current = resolve));
  }

  function finish(where: To | null) {
    done.current?.(where);
    done.current = null;
  }

  async function confirm() {
    if (saving || !task) return;
    const f = FIELD[to];
    const link = pickLink(values[to]);
    if (!link) return setError(linkProblem(values[to], f.label, f.example));
    setSaving(true);
    const res = await (to === "delivered" ? tickTask(task.id, link) : tickToClient(task.id, link)).catch(() => ({ error: OFFLINE }));
    setSaving(false);
    if (res.error) return setError(res.error);
    finish(to);
    ref.current?.close();
  }

  const f = FIELD[to];
  const prompt = (
    <dialog
      ref={ref}
      onClose={() => finish(null)}
      {...closeOnBackdrop}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
    >
      <form
        method="dialog"
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        {task?.toClient && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {(["delivered", "client"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={to === k}
                onClick={() => {
                  setTo(k);
                  setError(null);
                }}
                className="chip rounded-full px-3 py-1 text-xs"
              >
                {stageLabel(FIELD[k].stage, "video")}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm font-medium">{f.label}</p>
        <p className="text-xs text-muted">Required before moving this to {stageLabel(f.stage, "video")}.</p>
        <input
          key={to}
          autoFocus
          value={values[to]}
          onChange={(e) => {
            const v = e.target.value;
            setValues((old) => ({ ...old, [to]: v }));
            setError(null);
          }}
          placeholder={f.example}
          aria-label={f.label}
          aria-invalid={!!error}
          className={`rounded-md border bg-surface-2 px-2 py-1 text-sm ${error ? "border-red-400/60" : "border-border"}`}
        />
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-glow disabled:opacity-60">
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </form>
    </dialog>
  );

  return { prompt, ask };
}
