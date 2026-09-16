"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Image as ImageIcon } from "lucide-react";
import { createProject } from "./actions";
import { resizeToJpeg } from "@/lib/imageResize";
import { DELIVERABLE_TYPES } from "@/lib/deliverableTypes";

// The same shape every project starts with — name, cover, and which of the
// agency's deliverable types apply — so a project set up in five minutes on
// a busy day looks identical to one set up carefully.
// `row`: a slim bar at the head of the list view instead of a tile
export function AddProjectCard({ clientId, row = false }: { clientId: string; row?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setName("");
    setCover(null);
    setTypes([]);
    setError(null);
    dialogRef.current?.showModal();
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCover(await resizeToJpeg(file, 480, 270));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  function toggleType(t: string) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createProject(clientId, name, cover, types);
    setSaving(false);
    if (res.error) return setError(res.error);
    dialogRef.current?.close();
    router.push(`/projects/${res.id}`);
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      <button
        onClick={open}
        className={`btn-add flex items-center justify-center gap-1.5 rounded-xl ${row ? "w-full py-2.5" : "h-full min-h-[140px] flex-col"}`}
      >
        <Plus size={18} />
        <span className="text-xs">New project</span>
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="mb-4 text-base font-semibold">New project</h2>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-dashed border-border bg-surface-2"
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1.5 text-muted">
                <ImageIcon size={18} />
                <span className="text-xs">Add a cover</span>
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickCover} className="hidden" />

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Episode or project name"
              className={field}
            />
          </label>

          <div className="flex flex-col gap-1.5 text-xs text-muted">
            Deliverables <span className="font-normal normal-case">(what this project will produce)</span>
            <div className="flex flex-wrap gap-1.5">
              {DELIVERABLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    types.includes(t)
                      ? "border-blue-400/40 bg-blue-400/15 text-blue-200"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-lg px-4 py-2 text-xs">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
