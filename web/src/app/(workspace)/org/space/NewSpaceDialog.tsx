"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FilePlus2 } from "lucide-react";
import { KIND_LABEL, type SpaceKind } from "@/lib/space";
import { closeOnBackdrop } from "../../dialog";
import { createSpace } from "./actions";

// What a copy brings with it, by kind (never the leads)
const COPIES: Record<SpaceKind, string> = {
  section: "its portals, boards, stages, properties and tags",
  portal: "its boards, stages, properties and tags",
  board: "its stages, properties and tags",
};
const BLANK: Record<SpaceKind, string> = {
  section: "Starts empty, ready for its first portal.",
  portal: "Starts empty, ready for its first board.",
  board: "Starts with three stages: To do, In progress and Done.",
};
const EXAMPLE: Record<SpaceKind, string> = { section: "Outreach", portal: "Podcast", board: "Dream 156" };

// A new section, portal or board: a name, and where it starts from (blank,
// or a copy of a sibling's structure). Opens on `open`; on success it goes
// to the new page (a board opens as the portal's ?board=).
export function NewSpaceDialog({
  open,
  onClose,
  teamId,
  parentId,
  kind,
  base,
  siblings,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  parentId: string | null;
  kind: SpaceKind;
  // the parent page's address; the new page lives under it
  base: string;
  siblings: { id: string; name: string }[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName("");
      setFrom(null);
      setError(null);
      setBusy(false);
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await createSpace({ teamId, parentId, name, copyFromId: from });
    if (res.error || !res.slug) {
      setBusy(false);
      return setError(res.error ?? "That couldn't be created. Try again.");
    }
    onClose();
    router.push(kind === "board" ? `${base}?board=${res.slug}` : `${base}/${res.slug}`);
  }

  const label = KIND_LABEL[kind].toLowerCase();
  const source = siblings.find((s) => s.id === from);

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={() => open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
    >
      <form
        method="dialog"
        className="flex flex-col gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div>
          <h2 className="text-base font-semibold">New {label}</h2>
          <p className="mt-1 text-xs text-muted">Give it a name, then start blank or from a copy of one you already have.</p>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Name
          <input
            ref={input}
            autoFocus
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${EXAMPLE[kind]}`}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-hover disabled:opacity-60"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Start from</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!from} onClick={() => setFrom(null)} className="chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
              <FilePlus2 size={12} strokeWidth={1.5} /> Blank
            </button>
            {siblings.map((s) => (
              <button key={s.id} type="button" aria-pressed={from === s.id} onClick={() => setFrom(s.id)} className="chip flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs">
                <Copy size={12} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate">Copy of {s.name}</span>
              </button>
            ))}
          </div>
          {/* keyed so it eases in afresh with each pick */}
          <p key={from ?? "blank"} className="fade-in text-xs text-muted/80">
            {source ? `Copies ${COPIES[kind]} from ${source.name}. Leads are never copied.` : BLANK[kind]}
          </p>
        </div>

        {error && (
          <p role="alert" className="fade-in text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || busy} className="btn btn-sm btn-glow disabled:opacity-50">
            {busy ? "Saving…" : `Create ${label}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
