"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CircleDot,
  FolderOpen,
  Hash,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { resizeToJpeg } from "@/lib/imageResize";
import { DatePicker } from "../DatePicker";
import { Dropdown } from "../Dropdown";
import { chip } from "../chip";
import { updateProject, deleteProject } from "../clients/actions";
import { CoverPicker } from "../clients/CoverPicker";
import { closeOnBackdrop } from "../dialog";
import { EditableName } from "../EditableName";

// Cover left, the few facts that matter right. Editing swaps the right-hand
// column in place rather than opening a dialog.
// one look for the buttons over a project's cover
const COVER_BASE = "flex h-8 shrink-0 items-center justify-center rounded-full bg-black/70 text-xs font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-black/85 hover:ring-white/30";
const COVER_BUTTON = `${COVER_BASE} gap-1.5 px-3`;

export function ProjectHeader({
  projectId,
  clientId,
  clientHref,
  name,
  status,
  coverUrl,
  driveLink,
  type,
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
  /** yyyy-mm-dd, for the editable date field */
  completedOn: string;
  canDelete: boolean;
  // the invoice picker, when this project is in one
  invoice?: React.ReactNode;
  // every project type in use, most used first — the Type picker's list
  types: string[];
  // what's in it, for the three numbers under the facts
  stats: { delivered: number; files: number };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Every fact is changed where it shows, saved as it's picked (Abhishek, 21
  // Nov 2026: "without clicking on the edit button"), the cover too, and
  // there's no Edit at all. Shown at once, put back if it doesn't save.
  const base = {
    name,
    status,
    driveLink: driveLink ?? "",
    type,
    completedAt: completedOn,
    coverUrl,
  };
  const [over, setOver] = useState<Partial<typeof base>>({});
  // an undo hands back to what's saved
  useEffect(() => {
    const reset = () => setOver({});
    window.addEventListener("easeus:undo", reset);
    return () => window.removeEventListener("easeus:undo", reset);
  }, []);
  const cur = { ...base, ...over };
  async function saveNow(
    patch: Partial<typeof base>,
  ): Promise<string | undefined> {
    setError(null);
    setOver((o) => ({ ...o, ...patch }));
    const next = { ...cur, ...patch };
    // marked completed with no date: the server stamps today
    // the cover only when it's what changed: it can be a whole picture
    const { coverUrl: nextCover, ...facts } = next;
    const res = await updateProject(projectId, {
      ...facts,
      completedAt:
        "completedAt" in patch
          ? facts.completedAt
          : facts.completedAt || undefined,
      ...("coverUrl" in patch ? { coverUrl: nextCover } : {}),
    }).catch(() => ({
      error: "That couldn't be saved. Check your connection and try again.",
    }));
    if (res.error) {
      setOver((o) =>
        Object.fromEntries(Object.entries(o).filter(([k]) => !(k in patch))),
      );
      setError(res.error);
      return res.error;
    }
    router.refresh();
  }

  // a new cover, from a file (480x270, as a project's own cover elsewhere, so
  // it matches what the Notion import made) or another of the client's
  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await saveNow({ coverUrl: await resizeToJpeg(file, 480, 270) });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't process that image.",
      );
    }
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

  return (
    // One card: the cover, then everything about the project beside it —
    // name, its facts as chips, and what's in it — rather than a few loose
    // lines floating next to a picture. Editing happens in the same place,
    // the same shapes turned into controls.
    <div className="card-surface flex flex-col gap-6 rounded-2xl p-5 shadow-sm md:flex-row">
      <div className="w-full shrink-0 md:w-80">
        {/* the cover changes in place: hovering it offers a new picture,
            another of the client's covers, or none */}
        <div className="group/cover relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2">
          {cur.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URI or a local file under public/, already downscaled
            <img
              src={cur.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">
              No cover
            </div>
          )}
          {/* three matching buttons along the foot of the picture, on a soft
              shade (Abhishek, 21 Nov 2026: "improve the buttons"); no blur
              inside the rounded cover (Safari's Dock app). A touchscreen never
              hovers: there they're always shown */}
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            {/* one row, all one height; removing is just its icon (Abhishek, 21 Nov 2026) */}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} className={COVER_BUTTON}>
                <ImagePlus size={13} /> Upload
              </button>
              <CoverPicker clientId={clientId} onPick={(url) => saveNow({ coverUrl: url })} className={COVER_BUTTON} label="Choose existing" />
              {cur.coverUrl && (
                <button
                  type="button"
                  onClick={() => saveNow({ coverUrl: null })}
                  title="Remove cover"
                  aria-label="Remove cover"
                  className={`${COVER_BASE} size-8 hover:text-red-400`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickCover}
          className="hidden"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col">
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
              <EditableName
                name={cur.name}
                pencil="hover"
                wrap
                onSave={(n) => saveNow({ name: n })}
              />
            </h1>
            <div className="flex shrink-0 gap-1.5">
              {cur.driveLink && (
                <a
                  href={cur.driveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-ghost flex items-center gap-1.5"
                >
                  <FolderOpen size={14} /> Drive
                </a>
              )}
              {/* no Edit: everything changes where it shows; deleting stays, as an icon */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => deleteRef.current?.showModal()}
                  title="Delete project"
                  aria-label="Delete project"
                  className="btn btn-sm btn-ghost flex items-center text-muted hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Dropdown
              pill={{
                icon: (
                  <CircleDot
                    size={12}
                    className={
                      cur.status === "completed"
                        ? "text-green-400"
                        : "text-blue-400"
                    }
                  />
                ),
              }}
              value={cur.status}
              options={[
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
              ]}
              onChange={(v) => v !== cur.status && saveNow({ status: v })}
            />
            <Dropdown
              pill={{ icon: <Hash size={12} className="text-rose-400" /> }}
              value={cur.type}
              placeholder="Type"
              create
              search={{ recent: 8, placeholder: "Find or add a type…" }}
              options={[...new Set([cur.type, ...types].filter(Boolean))].map(
                (t) => ({ value: t, label: t }),
              )}
              onChange={(v) => v !== cur.type && saveNow({ type: v })}
            />
            {cur.status === "completed" && (
              <DatePicker
                pill={{
                  icon: <CalendarCheck size={12} className="text-amber-400" />,
                }}
                value={cur.completedAt}
                onChange={(v) =>
                  v !== cur.completedAt && saveNow({ completedAt: v })
                }
                placeholder="Delivered on"
              />
            )}
            <label className={`${chip(!!cur.driveLink)} min-w-0 cursor-text`}>
              <FolderOpen size={12} className="shrink-0 text-blue-400" />
              <input
                key={base.driveLink}
                defaultValue={cur.driveLink}
                onBlur={(e) =>
                  e.target.value.trim() !== cur.driveLink &&
                  saveNow({ driveLink: e.target.value.trim() })
                }
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                placeholder="Drive folder link"
                aria-label="Drive folder link"
                className="w-48 bg-transparent text-xs text-foreground outline-none! placeholder:text-muted"
              />
            </label>
            {invoice}
          </div>
          {/* what's in it, at a glance */}
          <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
            {(
              [
                ["Files", stats.files],
                ["Delivered", stats.delivered],
                ["Pending", stats.files - stats.delivered],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-xl bg-foreground/[0.03] px-4 py-3"
              >
                <p
                  className={`text-xl font-semibold tabular-nums ${n ? "text-foreground" : "text-muted"}`}
                >
                  {n}
                </p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>
      </div>

      <dialog
        ref={deleteRef}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">
          Delete <strong>{name}</strong>? Its file links go with it. This
          can&apos;t be undone.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => deleteRef.current?.close()}
            className="btn btn-sm btn-ghost"
          >
            Cancel
          </button>
          <button onClick={confirmDelete} className="btn btn-sm btn-danger">
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}
