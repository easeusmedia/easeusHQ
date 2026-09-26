"use client";

import { useRef, useState } from "react";
import { Images } from "lucide-react";
import { listClientCovers } from "./actions";

// Pick a cover this client already uses, instead of hunting down the same
// image again. Duplicating a project isn't a thing here, and some clients
// (Dr Tego) put the same brand card on everything — so the covers already
// in use are offered as a pool. Nothing is copied: the new project simply
// points at the same picture.
export function CoverPicker({ clientId, onPick }: { clientId: string; onPick: (url: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [covers, setCovers] = useState<{ url: string; name: string }[] | null>(null);

  async function open() {
    dialogRef.current?.showModal();
    setCovers(null);
    setCovers(await listClientCovers(clientId));
  }

  return (
    <>
      <button type="button" onClick={open} className="btn btn-xs btn-ghost flex items-center gap-1.5">
        <Images size={13} /> Use an existing cover
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[80vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 text-foreground"
      >
        <h2 className="mb-1 text-base font-semibold">This client&apos;s covers</h2>
        <p className="mb-4 text-xs text-muted">Pick one to use it again.</p>

        {covers === null ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : covers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No covers on this client&apos;s projects yet.</p>
        ) : (
          <div className="fade-in grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {covers.map((c) => (
              <button
                key={c.url}
                type="button"
                onClick={() => {
                  onPick(c.url);
                  dialogRef.current?.close();
                }}
                title={c.name}
                className="card-surface card-interactive flex flex-col overflow-hidden rounded-xl text-left"
              >
                <span className="aspect-video w-full overflow-hidden bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local file under public/, or a data: URI */}
                  <img src={c.url} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="truncate px-2.5 py-2 text-xs text-muted">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
