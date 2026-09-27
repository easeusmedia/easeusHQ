"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, AudioLines, Check, File as FileIcon, FileText, Film, Image as ImageIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { TYPE_ORDER } from "@/lib/deliverableTypes";
import { Dropdown } from "../Dropdown";
import { addProjectAsset, updateProjectAsset, deleteProjectAsset } from "../clients/actions";
import { ConfirmButton } from "../ConfirmButton";
import { formatDate } from "../TaskCard";

export type ProjectAssetData = { id: string; name: string; contentType: string; link: string | null };

const TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: t === "Misc." ? "Other" : t }));
const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Everything a Notion import produced is editable here: the name, which
// deliverable type it files under, and the link itself. Several of the
// imported rows are wrong (wrong link, wrong bucket, a placeholder that
// never got filled), and there was previously no way to fix any of it
// short of editing the database by hand.
// A task that's been delivered, as the file it produced.
export type DeliveredFile = { id: string; title: string; link: string | null; at: string };

// How a type reads on screen — the stored names stay as they are. Tabs name
// the collection; a row names the one file.
const TAB: Record<string, string> = {
  "YouTube Long-Form": "Long-form",
  "Reel Trailer": "Trailers",
  Reel: "Reels",
  "Bonus Reel": "Bonus reels",
  Thumbnails: "Thumbnails",
  "Misc.": "Other",
};
const ONE: Record<string, string> = {
  "YouTube Long-Form": "YouTube long-form",
  "Reel Trailer": "Trailer",
  Reel: "Reel",
  "Bonus Reel": "Bonus reel",
  Thumbnails: "Thumbnail",
  "Misc.": "Other",
};

// what the file is, at a glance
function iconFor(type: string, name: string) {
  if (type === "Thumbnails") return ImageIcon;
  if (type === "Misc.") {
    if (/audio|\.(mp3|wav|m4a)$/i.test(name)) return AudioLines;
    if (/copy|script|caption|doc|brief/i.test(name)) return FileText;
    return FileIcon;
  }
  return Film;
}

// where the link goes, in words
function source(link: string | null) {
  if (!link) return "No link yet";
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    if (host.endsWith("drive.google.com") || host.endsWith("docs.google.com")) return "Google Drive";
    if (host === "f.io" || host.endsWith("frame.io")) return "Frame.io";
    if (host.endsWith("dropbox.com")) return "Dropbox";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "YouTube";
    return host;
  } catch {
    return "Link";
  }
}

type Row = { id: string; name: string; type: string; link: string | null; sub: string; asset?: ProjectAssetData };

// A project's files as one quiet list: a tab per kind of file (All first), a
// row per file — what it is, where it lives, and a click opens it. The same
// list on the team's page and the client's; the client's has no controls.
export function ProjectFiles({
  projectId,
  assets,
  delivered = [],
  readOnly = false,
}: {
  projectId: string;
  assets: ProjectAssetData[];
  // Finished tasks belong here, not in the task list: once it's delivered a
  // task *is* its file. Not editable from here — it's still a task, and it's
  // edited as one.
  delivered?: DeliveredFile[];
  // the client's own page: the files, without the controls
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");

  const rank = (t: string) => (t === "delivered" ? -1 : TYPE_ORDER.indexOf(t) === -1 ? 99 : TYPE_ORDER.indexOf(t));
  const rows: Row[] = [
    ...delivered.map((d) => ({ id: d.id, name: d.title, type: "delivered", link: d.link, sub: `Delivered ${formatDate(d.at)}` })),
    ...assets.map((a) => ({ id: a.id, name: a.name, type: a.contentType, link: a.link, sub: source(a.link), asset: a })),
  ].sort((x, y) => rank(x.type) - rank(y.type));
  const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.type] = (acc[r.type] ?? 0) + 1), acc), {});
  const types = Object.keys(counts).sort((a, b) => rank(a) - rank(b));
  // a tab whose last file was just removed falls back to All
  const shown = tab !== "all" && counts[tab] ? tab : "all";
  const visible = shown === "all" ? rows : rows.filter((r) => r.type === shown);

  async function remove(id: string) {
    const res = await deleteProjectAsset(id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    // read-only, it sits under a heading of the client page's own
    <section className={readOnly ? undefined : "mt-12"}>
      {!readOnly && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">
            Files {rows.length > 0 && <span className="ml-1 font-normal text-muted">{rows.length}</span>}
          </h2>
          <button onClick={() => setAdding(true)} className="btn btn-sm btn-add flex items-center gap-1.5">
            <Plus size={13} /> Add file
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}

      {adding && (
        <div className="fade-in panel mb-4 rounded-2xl">
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

      {rows.length === 0 ? (
        !adding && <p className="text-sm text-muted">No files yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {types.length > 1 && (
            <div role="tablist" aria-label="File types" className="panel-soft flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl p-1">
              {["all", ...types].map((t) => {
                const on = shown === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                      on ? "selected" : "border border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {t === "all" ? "All" : t === "delivered" ? "Delivered" : (TAB[t] ?? t)}
                    <span className="text-xs tabular-nums text-muted/70">{t === "all" ? rows.length : counts[t]}</span>
                  </button>
                );
              })}
            </div>
          )}

          <ul key={shown} className="fade-in panel divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
            {visible.map((r) => {
              if (r.asset && editingId === r.id) {
                const a = r.asset;
                return (
                  <li key={r.id} className="p-3">
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
                  </li>
                );
              }
              const Icon = r.type === "delivered" ? Film : iconFor(r.type, r.name);
              // in All, say what kind of file each one is; a tab already says
              const sub = shown === "all" && r.type !== "delivered" ? `${ONE[r.type] ?? r.type} · ${r.sub}` : r.sub;
              return (
                <li key={r.id} className="group relative flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-white/[0.03]">
                  <span className="badge flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    {r.link ? (
                      // the whole row opens the file; the buttons sit above it
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-foreground after:absolute after:inset-0"
                      >
                        {r.name}
                      </a>
                    ) : (
                      <span className="block truncate text-sm text-muted">{r.name}</span>
                    )}
                    <span className="block truncate text-xs text-muted">{sub}</span>
                  </span>
                  {r.link && (
                    <ArrowUpRight
                      size={15}
                      className="shrink-0 text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    />
                  )}
                  {/* Always there — hidden until hovered, nobody knew a file
                      could be edited, and a touchscreen never hovers — but
                      faint until the row is pointed at. */}
                  {!readOnly && r.asset && (
                    <span className="relative z-10 flex shrink-0 items-center gap-0.5 opacity-50 transition-opacity duration-200 group-hover:opacity-100">
                      <button
                        onClick={() => setEditingId(r.id)}
                        title="Edit the name, type or link"
                        aria-label={`Edit ${r.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      <ConfirmButton
                        confirm="Remove"
                        message={`Remove "${r.name}" from this project? Only the link is removed; the file itself stays where it's stored.`}
                        onConfirm={() => remove(r.id)}
                        className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-red-300"
                      >
                        <Trash2 size={14} aria-label={`Remove ${r.name}`} />
                      </ConfirmButton>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
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
    <div className="flex flex-col gap-2 rounded-xl bg-white/[0.02] p-3">
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
        <button onClick={onCancel} className="btn btn-sm btn-ghost flex items-center gap-1.5">
          <X size={13} /> Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="btn btn-sm btn-glow flex items-center gap-1.5 disabled:opacity-60"
        >
          <Check size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
