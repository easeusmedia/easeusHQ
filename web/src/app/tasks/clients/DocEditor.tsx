"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateClientDoc, type ClientDocType } from "./actions";

export function DocEditor({ clientId, doc, label, content }: { clientId: string; doc: ClientDocType; label: string; content: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!content); // straight into edit mode when there's nothing here yet
  const [value, setValue] = useState(content ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await updateClientDoc(clientId, doc, value);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          autoFocus
          rows={18}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Write ${label.toLowerCase()} for this client…`}
          className="rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed"
        />
        <div className="flex justify-end gap-2">
          {content && (
            <button onClick={() => { setValue(content); setEditing(false); }} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
              Cancel
            </button>
          )}
          <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface rounded-xl p-5 shadow-sm">
      <div className="mb-3 flex justify-end">
        <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
          <Pencil size={12} /> Edit
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7">{content}</p>
    </div>
  );
}
