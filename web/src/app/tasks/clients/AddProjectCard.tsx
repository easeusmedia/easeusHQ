"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createProject } from "./actions";

// Matches the project cards' footprint so the grid stays even.
export function AddProjectCard({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createProject(clientId, name);
    setSaving(false);
    if (res.error) return setError(res.error);
    router.push(`/tasks/projects/${res.id}`);
  }

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Plus size={22} />
        <span className="text-xs">New project</span>
      </button>
    );
  }

  return (
    <div className="flex min-h-[200px] flex-col justify-center gap-2 rounded-2xl border border-border bg-surface-2/40 p-4">
      <input
        autoFocus
        placeholder="Episode or project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setAdding(false);
        }}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setAdding(false)} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
