"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, AudioLines, Check, File as FileIcon, FileText, Film, Image as ImageIcon, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { TYPE_ORDER } from "@/lib/deliverableTypes";
import { Dropdown } from "../Dropdown";
import { addProjectAsset, updateProjectAsset, deleteProjectAsset, setPostDate } from "../clients/actions";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { formatDate } from "../TaskCard";
import { TaskTagChip } from "../TaskTagPicker";

type Tag = { id: string; name: string };
export type ProjectAssetData = { id: string; name: string; contentType: string; link: string | null; tags?: Tag[] };

const TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: t === "Misc." ? "Other" : t }));
const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

// Everything a Notion import produced is editable here: the name, which
// deliverable type it files under, and the link itself. Several of the
// imported rows are wrong (wrong link, wrong bucket, a placeholder that
// never got filled), and there was previously no way to fix any of it
// short of editing the database by hand.
// A task that's been delivered, as the file it produced: when it was
// delivered, and the day it goes live on the client's channel (yyyy-mm-dd)
export type DeliveredFile = { id: string; title: string; link: string | null; at: string; post?: string | null; tags?: Tag[] };

// A delivered file's posting day: set here, saved at once
function PostingDate({ taskId, initial }: { taskId: string; initial: string | null }) {
  const [day, setDay] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="relative z-10 flex shrink-0 items-center gap-2" title={error ?? "When it goes live on their channel"}>
      <DatePicker
        pill={{ icon: <Megaphone size={12} className="text-pink-400" />, label: "Posting" }}
        value={day}
        placeholder="Posting"
        onChange={async (v) => {
          const before = day;
          setDay(v);
          const res = await setPostDate(taskId, v);
          if (res.error) {
            setDay(before);
            setError(res.error);
          } else setError(null);
        }}
      />
    </span>
  );
}

// A file's type when it has no tag yet, in the same words the tags use —
// the Notion import spelled the types a dozen ways ("Reels", "TRAILER"…).
function typeKind(type: string) {
  const t = type.toLowerCase();
  if (t.includes("long")) return "Long-form";
  if (t.includes("trailer")) return "Trailer";
  if (t.includes("bonus")) return "Bonus reel";
  if (t.includes("reel")) return "Reel";
  if (t.includes("thumb")) return "Thumbnail";
  if (t.includes("carousel")) return "Carousel";
  if (t === "misc.") return "Other";
  return type;
}

// what the file is, at a glance
function iconFor(type: string, name: string) {
  if (/thumb/i.test(type) || /thumb/i.test(name)) return ImageIcon;
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

// kinds: its tags, or its type when it has none; tagged: which of those are tags
type Row = { id: string; name: string; type: string; link: string | null; sub: string; kinds: string[]; tagged: boolean; asset?: ProjectAssetData; post?: string | null };

// A project's files as one quiet list: a tab per kind of work (All first),
// a row per file — what it is, its tags, where it lives, and a click opens
// it. The same list on the team's page and the client's; the client's has
// no controls.
export function ProjectFiles({
  projectId,
  assets,
  delivered = [],
  readOnly = false,
  canPost = false,
  tagOptions = [],
}: {
  projectId: string;
  assets: ProjectAssetData[];
  // Finished tasks belong here, not in the task list: once it's delivered a
  // task *is* its file. Not editable from here — it's still a task, and it's
  // edited as one.
  delivered?: DeliveredFile[];
  // the client's own page: the files, without the controls
  readOnly?: boolean;
  // Operations: a posting date on each delivered file (lib/scope seesPostings)
  canPost?: boolean;
  // the tags a file can be given (the same as a task's kinds of work)
  tagOptions?: Tag[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");

  const kindsOf = (tags: Tag[] | undefined, fallback: string) =>
    tags?.length ? { kinds: tags.map((t) => t.name), tagged: true } : { kinds: [fallback], tagged: false };
  const rows: Row[] = [
    ...delivered.map((d) => ({
      id: d.id,
      name: d.title,
      type: "delivered",
      link: d.link,
      // untagged, it's already filed under "Delivered": just the day
      sub: d.tags?.length ? `Delivered ${formatDate(d.at)}` : formatDate(d.at),
      post: d.post ?? null,
      ...kindsOf(d.tags, "Delivered"),
    })),
    ...assets.map((a) => ({ id: a.id, name: a.name, type: a.contentType, link: a.link, sub: source(a.link), asset: a, ...kindsOf(a.tags, typeKind(a.contentType)) })),
  ];
  // tabs: the tags in their own order, then any types without a tag, Other last
  const tagOrder = tagOptions.map((t) => t.name);
  const rank = (k: string) => (k === "Other" ? 999 : tagOrder.includes(k) ? tagOrder.indexOf(k) : 500);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    for (const k of r.kinds) acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const kinds = Object.keys(counts).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  rows.sort((x, y) => rank(x.kinds[0]) - rank(y.kinds[0]) || x.kinds[0].localeCompare(y.kinds[0]));
  // a tab whose last file was just removed falls back to All
  const shown = tab !== "all" && counts[tab] ? tab : "all";
  const visible = shown === "all" ? rows : rows.filter((r) => r.kinds.includes(shown));

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
            tagOptions={tagOptions}
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
          {kinds.length > 1 && (
            <div role="tablist" aria-label="File types" className="panel-soft flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl p-1">
              {["all", ...kinds].map((t) => {
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
                    {t === "all" ? "All" : t}
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
                      tagOptions={tagOptions}
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
              // its tags as chips; a file with none says its type, quietly
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
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      {r.tagged ? r.kinds.map((k) => <TaskTagChip key={k} name={k} />) : <span className="shrink-0">{r.kinds[0]}</span>}
                      <span className="truncate">· {r.sub}</span>
                    </span>
                  </span>
                  {canPost && !readOnly && r.type === "delivered" && <PostingDate taskId={r.id} initial={r.post ?? null} />}
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
  tagOptions,
  onCancel,
  onSubmit,
}: {
  initial?: ProjectAssetData;
  tagOptions: Tag[];
  onCancel: () => void;
  onSubmit: (input: { name: string; contentType: string; link: string; tagIds: string[] }) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contentType, setContentType] = useState(initial?.contentType ?? TYPE_ORDER[0]);
  const [link, setLink] = useState(initial?.link ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial?.tags?.map((t) => t.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const err = await onSubmit({ name, contentType, link, tagIds });
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
      {tagOptions.length > 0 && (
        // the same kinds of work a task is tagged with
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted">Tags</span>
          {tagOptions.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTagIds((ids) => (on ? ids.filter((i) => i !== t.id) : [...ids, t.id]))}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors duration-200 ${
                  on ? "selected" : "border border-white/[0.08] text-muted hover:text-foreground"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}
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
