"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { TYPE_ORDER } from "@/lib/deliverableTypes";
import { Dropdown } from "../Dropdown";
import { addProjectAsset, updateProjectAsset, deleteProjectAsset } from "../clients/actions";

export type ProjectAssetData = { id: string; name: string; contentType: string; link: string | null };

const TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: t }));
const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Everything a Notion import produced is editable here: the name, which
// deliverable type it files under, and the link itself. Several of the
// imported rows are wrong (wrong link, wrong bucket, a placeholder that
// never got filled), and there was previously no way to fix any of it
// short of editing the database by hand.
export function ProjectFiles({
  projectId,
  assets,
  readOnly = false,
}: {
  projectId: string;
  assets: ProjectAssetData[];
  // the client's own page: the files, without the controls
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = Object.entries(
    assets.reduce<Record<string, ProjectAssetData[]>>((acc, a) => {
      (acc[a.contentType] ??= []).push(a);
      return acc;
    }, {})
  ).sort(([a], [b]) => {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  async function remove(id: string) {
    const res = await deleteProjectAsset(id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    // read-only, it sits under a "Files" tab that already names and counts it
    <section className={readOnly ? undefined : "mt-12"}>
      {!readOnly && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Files</h2>
          <div className="flex items-center gap-3">
            {assets.length > 0 && <span className="text-xs text-muted">{assets.length} total</span>}
            <button onClick={() => setAdding(true)} className="btn-add flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
              <Plus size={13} /> Add file
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}

      {adding && (
        <div className="fade-in mb-6">
          <AssetForm
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              const res = await addProjectAsset(projectId, input);
              if (res.error) return res.error;
              setAdding(false);
              router.refresh();
              return null;
            }}
          />
        </div>
      )}

      {groups.length === 0 && !adding ? (
        <p className="text-sm text-muted">No files recorded for this project yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([type, rows]) => (
            <div key={type}>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                {type} <span className="text-muted/60">{rows.length}</span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map((a) =>
                  editingId === a.id ? (
                    <div key={a.id} className="sm:col-span-2">
                      <AssetForm
                        initial={a}
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (input) => {
                          const res = await updateProjectAsset(a.id, input);
                          if (res.error) return res.error;
                          setEditingId(null);
                          router.refresh();
                          return null;
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      key={a.id}
                      className="group flex items-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 hover:bg-surface-2"
                    >
                      {a.link ? (
                        <a
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate">{a.name}</span>
                          <ExternalLink size={13} className="shrink-0 text-muted" />
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">{a.name}</span>
                      )}
                      {/* only on hover, so a row of files stays a row of
                          files rather than a row of controls */}
                      {!readOnly && (
                      <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setEditingId(a.id)}
                          title="Edit file"
                          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => remove(a.id)}
                          title="Remove file"
                          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AssetForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: ProjectAssetData;
  onCancel: () => void;
  onSubmit: (input: { name: string; contentType: string; link: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contentType, setContentType] = useState(initial?.contentType ?? TYPE_ORDER[0]);
  const [link, setLink] = useState(initial?.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const err = await onSubmit({ name, contentType, link });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="File name"
          className={`${field} sm:flex-1`}
        />
        <div className="sm:w-52">
          <Dropdown defaultValue={contentType} options={TYPE_OPTIONS} onChange={setContentType} />
        </div>
      </div>
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={field} />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
          <X size={13} /> Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="btn-glow flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          <Check size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
