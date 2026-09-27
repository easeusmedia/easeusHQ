"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";

// Attaching files to anything sent to Claude — an earlier contract, a brief,
// a rate card, a screenshot. PDFs, images and text files, up to 4MB in all.

const ACCEPT = "application/pdf,image/png,image/jpeg,image/gif,image/webp,.txt,.md,.csv,text/plain";
const LIMIT = 4 * 1024 * 1024;

export function useAttachments() {
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  function add(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])].slice(0, 5);
    if (next.reduce((n, f) => n + f.size, 0) > LIMIT) return setProblem("That's more than 4MB — attach fewer or smaller files.");
    setProblem(null);
    setFiles(next);
  }
  return {
    files,
    problem,
    add,
    remove: (i: number) => setFiles((f) => f.filter((_, j) => j !== i)),
    clear: () => {
      setFiles([]);
      setProblem(null);
    },
  };
}

export function AttachButton({ onPick, disabled, size = 14 }: { onPick: (list: FileList | null) => void; disabled?: boolean; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Attach files"
        title="Attach files — PDFs, images or text"
        className="flex shrink-0 items-center justify-center rounded-full p-1 text-muted transition-colors hover:text-accent disabled:opacity-40"
      >
        <Paperclip size={size} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = ""; // picking the same file again still counts
        }}
      />
    </>
  );
}

export function FileChips({ names, onRemove }: { names: string[]; onRemove?: (i: number) => void }) {
  if (!names.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="fade-in flex max-w-52 items-center gap-1 rounded-md border border-accent/20 bg-accent/[0.08] py-0.5 pl-1.5 pr-1 text-[11.5px] text-foreground/85">
          {/\.(png|jpe?g|gif|webp)$/i.test(n) ? <ImageIcon size={11} className="shrink-0 text-accent" /> : <FileText size={11} className="shrink-0 text-accent" />}
          <span className="truncate">{n}</span>
          {onRemove && (
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${n}`} className="rounded text-muted hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </span>
  );
}
