"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Link2, X } from "lucide-react";
import { ADD_BUTTON, PlusBadge } from "../../AddButton";
import { InstagramIcon, YoutubeIcon } from "../../PlatformIcon";
import { createLead } from "./actions";

// The podcast's own pages, asked for up front (all optional)
const LINKS = [
  { key: "instagram", label: "Podcast Instagram", icon: <InstagramIcon size={14} />, placeholder: "instagram.com/…" },
  { key: "youtube", label: "YouTube channel", icon: <YoutubeIcon size={14} />, placeholder: "youtube.com/@…" },
  { key: "audio", label: "Audio (Spotify or Apple)", icon: <AudioLines size={14} />, placeholder: "open.spotify.com/show/…" },
] as const;

const BLANK = { title: "", instagram: "", youtube: "", audio: "" };

// "New lead", like "New task": a centred window asking for the podcast's
// name and its links; the lead then opens for everything else. It always
// starts at the board's first stage.
export function NewLead({ boardId, onCreated }: { boardId: string; onCreated: (id: string) => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setF(BLANK);
    setError(null);
    ref.current?.showModal();
  }

  async function submit() {
    if (!f.title.trim()) return setError("Give the lead a name.");
    setBusy(true);
    setError(null);
    const links = LINKS.filter((l) => f[l.key].trim()).map((l) => ({ label: l.label, url: f[l.key].trim() }));
    const res = await createLead(boardId, f.title, links).catch(() => ({ error: "That couldn't be saved. Check your connection and try again.", id: undefined }));
    setBusy(false);
    if (res.error || !res.id) return setError(res.error ?? "That couldn't be saved.");
    ref.current?.close();
    router.refresh();
    onCreated(res.id);
  }

  return (
    <>
      <button type="button" onClick={open} className={`${ADD_BUTTON} w-full`}>
        <PlusBadge /> New lead
      </button>

      <dialog ref={ref} className="glass fixed top-1/2 left-1/2 m-0 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col"
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <p className="text-xs font-medium text-muted">New lead</p>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="-mr-1.5 flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
          <div className="px-5 pt-2">
            <input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="Name of the podcast"
              aria-label="Name of the podcast"
              autoFocus
              className="w-full bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-col gap-2 px-5 pt-5 pb-5">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Link2 size={13} /> Links, if you have them
            </p>
            {LINKS.map((l) => (
              <label key={l.key} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-hover">
                <span className="shrink-0 text-muted">{l.icon}</span>
                <span className="w-44 shrink-0 text-xs text-muted">{l.label}</span>
                <input
                  value={f[l.key]}
                  onChange={(e) => setF({ ...f, [l.key]: e.target.value })}
                  placeholder={l.placeholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none! placeholder:text-muted/50"
                />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            <p className="min-w-0 truncate text-xs text-red-300">{error}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
                Cancel
              </button>
              <button disabled={busy} className="btn btn-glow disabled:opacity-60">
                {busy ? "Adding…" : "Add lead"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
