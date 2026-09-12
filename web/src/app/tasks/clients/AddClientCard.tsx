"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "./actions";

// The "+" tile that sits at the end of the Current group. Names the client
// and goes straight to its page — everything else about them gets filled in
// there, so there's no form to fill out here.
export function AddClientCard({ variant }: { variant: "card" | "row" }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createClient(name);
    setSaving(false);
    if (res.error) return setError(res.error);
    router.push(`/tasks/clients/${res.id}`);
  }

  const form = (
    <div className="flex w-full flex-col gap-2">
      <input
        autoFocus
        placeholder="Client name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setAdding(false);
        }}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setAdding(false)} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );

  if (variant === "row") {
    return adding ? (
      <div className="rounded-xl border border-border bg-surface-2/40 p-3">{form}</div>
    ) : (
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Plus size={15} /> Add client
      </button>
    );
  }

  return adding ? (
    <div className="flex h-40 flex-col justify-center rounded-2xl border border-border bg-surface-2/40 p-4">{form}</div>
  ) : (
    <button
      onClick={() => setAdding(true)}
      className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted hover:bg-surface-2 hover:text-foreground"
    >
      <Plus size={22} />
      <span className="text-xs">Add client</span>
    </button>
  );
}
