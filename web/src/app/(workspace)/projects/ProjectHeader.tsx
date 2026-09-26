"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CircleDot, FolderOpen, Hash, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { resizeToJpeg } from "@/lib/imageResize";
import { DatePicker } from "../DatePicker";
import { Dropdown } from "../Dropdown";
import { chip } from "../chip";
import { updateProject, deleteProject } from "../clients/actions";
import { CoverPicker } from "../clients/CoverPicker";

// Cover left, the few facts that matter right. Editing swaps the right-hand
// column in place rather than opening a dialog.
export function ProjectHeader({
  projectId,
  clientId,
  clientHref,
  name,
  status,
  coverUrl,
  driveLink,
  type,
  completedAt,
  completedOn,
  canDelete,
  invoice,
  types,
  stats,
}: {
  projectId: string;
  // whose covers the picker offers
  clientId: string;
  // where its client lives — where deleting the project lands you
  clientHref: string;
  name: string;
  status: string;
  coverUrl: string | null;
  driveLink: string | null;
  type: string;
  completedAt: string | null;
  /** yyyy-mm-dd, for the editable date field */
  completedOn: string;
  canDelete: boolean;
  // the invoice picker, when this project is in one
  invoice?: React.ReactNode;
  // every project type in use, most used first — the Type picker's list
  types: string[];
  // what's in it, for the three numbers under the facts
  stats: { active: number; delivered: number; files: number };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name,
    status,
    driveLink: driveLink ?? "",
    type,
    completedAt: completedOn,
  });
  // held separately from the rest of the form: undefined means "leave the
  // cover as it is", null means "remove it", a string means "replace it"
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const shownCover = cover === undefined ? coverUrl : cover;

  function startEditing() {
    setForm({ name, status, driveLink: driveLink ?? "", type, completedAt: completedOn });
    setCover(undefined);
    setError(null);
    setEditing(true);
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      // same 480x270 as a project's own cover elsewhere, so a replacement
      // matches whatever the Notion import produced
      setCover(await resizeToJpeg(file, 480, 270));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateProject(projectId, { ...form, ...(cover !== undefined ? { coverUrl: cover } : {}) });
    setSaving(false);
    if (res.error) return setError(res.error);
    setEditing(false);
    setCover(undefined);
    router.refresh();
  }

  async function confirmDelete() {
    const res = await deleteProject(projectId);
    if (res.error) {
      setError(res.error);
      deleteRef.current?.close();
      return;
    }
    // back to this client's own dashboard, not the top-level roster —
    // deleting one of a client's projects shouldn't bounce you away from
    // the client you were just looking at
    router.push(clientHref);
  }

  const done = status === "completed";
  const typeOptions = [...new Set([form.type, ...types].filter(Boolean))].map((t) => ({ value: t, label: t }));
  const fact = "flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs";

  return (
    // One card: the cover, then everything about the project beside it —
    // name, its facts as chips, and what's in it — rather than a few loose
    // lines floating next to a picture. Editing happens in the same place,
    // the same shapes turned into controls.
    <div className="card-surface flex flex-col gap-6 rounded-2xl p-5 shadow-sm sm:flex-row">
      <div className="w-full shrink-0 sm:w-80">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2">
          {shownCover ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URI or a local file under public/, already downscaled
            <img src={shownCover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">No cover</div>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 text-sm font-medium text-white opacity-0 transition-opacity hover:opacity-100"
            >
              <ImagePlus size={16} /> {shownCover ? "Replace cover" : "Add cover"}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickCover} className="hidden" />
        {editing && (
          <div className="fade-in mt-2 flex flex-wrap items-center gap-1">
            {/* the same picture as another of this client's projects, rather
                than tracking the file down again */}
            <CoverPicker clientId={clientId} onPick={setCover} />
            {shownCover && (
              <button onClick={() => setCover(null)} className="btn btn-xs btn-ghost">
                Remove cover
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <div className="fade-in flex flex-1 flex-col">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Project name"
              aria-label="Project name"
              className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none! placeholder:text-muted/60"
            />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Dropdown
                pill={{
                  icon: (
                    <CircleDot
                      size={12}
                      className={form.status === "completed" ? "text-green-400" : "text-blue-400"}
                    />
                  ),
                }}
                value={form.status}
                options={[
                  { value: "in_progress", label: "In progress" },
                  { value: "completed", label: "Completed" },
                ]}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              />
              {/* the types already in use, or a new one typed in */}
              <Dropdown
                pill={{ icon: <Hash size={12} className="text-rose-400" /> }}
                value={form.type}
                placeholder="Type"
                create
                search={{ recent: 8, placeholder: "Find or add a type…" }}
                options={typeOptions}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
              />
              {form.status === "completed" && (
                <DatePicker
                  pill={{ icon: <CalendarCheck size={12} className="text-amber-400" /> }}
                  value={form.completedAt}
                  onChange={(v) => setForm((f) => ({ ...f, completedAt: v }))}
                  placeholder="Delivered on"
                />
              )}
              <label className={`${chip(!!form.driveLink)} min-w-0 cursor-text`}>
                <FolderOpen size={12} className="shrink-0 text-blue-400" />
                <input
                  value={form.driveLink}
                  onChange={(e) => setForm((f) => ({ ...f, driveLink: e.target.value }))}
                  placeholder="Drive folder link"
                  aria-label="Drive folder link"
                  className="w-48 bg-transparent text-xs text-foreground outline-none! placeholder:text-muted"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
            <div className="mt-auto flex items-center justify-between gap-2 pt-6">
              {canDelete ? (
                <button
                  onClick={() => deleteRef.current?.showModal()}
                  className="btn btn-sm btn-ghost flex items-center gap-1.5 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={13} /> Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="btn btn-sm btn-glow disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="fade-in flex flex-1 flex-col">
            <div className="flex items-start gap-3">
              <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{name}</h1>
              <div className="flex shrink-0 gap-1.5">
                {driveLink && (
                  <a
                    href={driveLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-ghost flex items-center gap-1.5"
                  >
                    <FolderOpen size={14} /> Drive
                  </a>
                )}
                <button onClick={startEditing} className="btn btn-sm btn-ghost flex items-center gap-1.5">
                  <Pencil size={13} /> Edit
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  done ? "bg-green-400/15 text-green-300" : "bg-blue-400/15 text-blue-300"
                }`}
              >
                {done ? "Completed" : "In progress"}
              </span>
              {type && (
                <span className={fact}>
                  <Hash size={12} className="text-rose-400" /> {type}
                </span>
              )}
              {completedAt && (
                <span className={fact}>
                  <CalendarCheck size={12} className="text-amber-400" /> {completedAt}
                </span>
              )}
              {invoice}
            </div>
            {/* what's in it, at a glance */}
            <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
              {(
                [
                  ["In flight", stats.active],
                  ["Delivered", stats.delivered],
                  ["Files", stats.files],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-xl bg-foreground/[0.03] px-4 py-3">
                  <p className={`text-xl font-semibold tabular-nums ${n ? "text-foreground" : "text-muted"}`}>{n}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
        )}
      </div>

      <dialog
        ref={deleteRef}
        onClick={(e) => {
          if (e.target === deleteRef.current) deleteRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">
          Delete <strong>{name}</strong>? Its file links go with it. This can&apos;t be undone.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            className="btn btn-sm btn-danger"
          >
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}
