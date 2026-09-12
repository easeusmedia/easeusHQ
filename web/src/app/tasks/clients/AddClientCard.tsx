"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "./actions";

// One way in, for every client. The dialog only asks for what's actually
// known at the moment someone is added — the rest of the structure comes
// from the template, and the onboarding checklist chases the rest.
export function AddClientCard({ variant }: { variant: "card" | "row" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name: "", niche: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setForm({ name: "", niche: "" });
    setError(null);
    dialogRef.current?.showModal();
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createClient(form.name, form.niche);
    setSaving(false);
    if (res.error) return setError(res.error);
    dialogRef.current?.close();
    router.push(`/tasks/clients/${res.id}`);
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      {variant === "row" ? (
        <button
          onClick={open}
          className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <Plus size={15} /> Add client
        </button>
      ) : (
        <button
          onClick={open}
          className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <Plus size={22} />
          <span className="text-xs">Add client</span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="text-base font-semibold">New client</h2>
        <p className="mt-1 mb-5 text-xs text-muted">
          They&apos;ll be set up from the client template — deliverables, documents and the onboarding checklist.
        </p>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Name
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Client or show name"
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Niche <span className="font-normal normal-case">— optional</span>
            <input
              value={form.niche}
              onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Podcast / leadership"
              className={field}
            />
          </label>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-lg px-4 py-2 text-xs">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
              {saving ? "Creating…" : "Create client"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
