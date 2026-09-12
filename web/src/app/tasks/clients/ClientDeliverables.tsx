"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { addDeliverable, updateDeliverable, deleteDeliverable } from "./actions";

export type Deliverable = { id: string; name: string; detail: string | null; deliveredCount: number };

// The contracted scope — "2 podcast episodes/cycle", "custom thumbnails" —
// distinct from the day-to-day Tasks tab. One deliverable can (eventually)
// cover many individual tasks; this is the retainer-level summary, the
// thing ops actually sold the client, not the daily work queue.
// deliveredCount is the running total to date (e.g. "14 delivered") — a
// plain number ops keeps current, not something auto-computed, since the
// real historical volume lives in Notion's task history.
export function ClientDeliverables({ clientId, deliverables }: { clientId: string; deliverables: Deliverable[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setName("");
    setDetail("");
    setDeliveredCount(0);
    setEditingId(null);
    setAdding(true);
  }

  function startEdit(d: Deliverable) {
    setName(d.name);
    setDetail(d.detail ?? "");
    setDeliveredCount(d.deliveredCount);
    setAdding(false);
    setEditingId(d.id);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save() {
    setSaving(true);
    const res = editingId
      ? await updateDeliverable(editingId, name, detail, deliveredCount)
      : await addDeliverable(clientId, name, detail, deliveredCount);
    setSaving(false);
    if (!res.error) {
      cancel();
      router.refresh();
    }
  }

  async function remove(id: string) {
    await deleteDeliverable(id);
    router.refresh();
  }

  const form = (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <input
        autoFocus
        placeholder="Deliverable — e.g. Podcast episodes"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
      />
      <input
        placeholder="Detail — e.g. 2 long-form per cycle"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        Delivered so far
        <input
          type="number"
          min={0}
          value={deliveredCount}
          onChange={(e) => setDeliveredCount(Number(e.target.value))}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={cancel} className="btn-ghost rounded-md px-3 py-1 text-xs">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <section className="card-surface flex flex-col gap-3 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Deliverables</h2>
        {!adding && (
          <button onClick={startAdd} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
            <Plus size={13} /> Add deliverable
          </button>
        )}
      </div>

      {deliverables.length === 0 && !adding ? (
        <p className="text-sm text-muted">
          No deliverables listed yet — this is the contracted scope, e.g. &ldquo;2 podcast episodes/cycle&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {deliverables.map((d) =>
            editingId === d.id ? (
              <li key={d.id}>{form}</li>
            ) : (
              <li key={d.id} className="group flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{d.name}</span>
                  {d.detail && <span className="text-muted"> — {d.detail}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.deliveredCount > 0 && (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">{d.deliveredCount} delivered</span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => startEdit(d)} className="btn-ghost flex h-6 w-6 items-center justify-center rounded-md">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => remove(d.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-red-300 hover:bg-red-500/10">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {adding && form}
    </section>
  );
}
