"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check } from "lucide-react";
import { createTag, setClientTags } from "./actions";
import { TAG_PALETTE } from "./tagPalette";

export type Tag = { id: string; name: string; color: string };

// One shared pool of tags across every client (Podcast, Personal brand,
// Leadership, plus the two the team always uses to describe how a client
// is engaged: Subscription / Project) — not per-client freeform text, so
// the same category never ends up spelled two different ways.
export function ClientTags({ clientId, clientTags, allTags }: { clientId: string; clientTags: Tag[]; allTags: Tag[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedIds = new Set(clientTags.map((t) => t.id));

  async function toggle(tagId: string) {
    const next = selectedIds.has(tagId) ? clientTags.filter((t) => t.id !== tagId).map((t) => t.id) : [...selectedIds, tagId];
    await setClientTags(clientId, next);
    router.refresh();
  }

  async function submitNewTag() {
    if (newName.trim() === "") return;
    setSaving(true);
    setError(null);
    const res = await createTag(newName, newColor);
    setSaving(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Couldn't create that tag.");
      return;
    }
    await setClientTags(clientId, [...selectedIds, res.id]);
    setNewName("");
    setCreating(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {clientTags.map((t) => (
        <span
          key={t.id}
          className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: `${t.color}26`, borderColor: `${t.color}4d`, color: t.color }}
        >
          {t.name}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
      >
        <Plus size={11} /> Tag
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface-2 p-1 shadow-xl">
          {!creating ? (
            <>
              <div className="max-h-48 overflow-y-auto">
                {allTags.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No tags yet.</p>}
                {allTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                    {selectedIds.has(t.id) && <Check size={13} />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-md border-t border-border px-2 py-1.5 text-left text-xs text-muted hover:bg-hover"
              >
                <Plus size={12} /> Create new tag
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-1.5">
              <input
                autoFocus
                placeholder="Tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              />
              <div className="flex flex-wrap gap-1.5">
                {TAG_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: c }}
                  >
                    {newColor === c && <Check size={11} className="text-black/70" />}
                  </button>
                ))}
              </div>
              {error && <p className="text-[11px] text-red-300">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="btn-ghost rounded-md px-2 py-1 text-xs">
                  <X size={12} />
                </button>
                <button
                  onClick={submitNewTag}
                  disabled={saving}
                  className="btn-glow rounded-md px-2 py-1 text-xs font-medium disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
