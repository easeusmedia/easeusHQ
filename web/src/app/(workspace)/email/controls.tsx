"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Trash2, Upload } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { ConfirmButton } from "../ConfirmButton";
import { deletePdf, finishPdfUpload, startPdfUpload } from "./actions";

// Which alias of the sales inbox the pages show (all of them by default)
export function AliasPicker({ aliases, value }: { aliases: string[]; value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  if (aliases.length < 2) return null;
  return (
    <div className="w-56">
      <Dropdown
        value={value}
        size="sm"
        placeholder="All aliases"
        options={[{ value: "", label: "All aliases" }, ...aliases.map((a) => ({ value: a, label: a }))]}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          if (v) next.set("alias", v);
          else next.delete("alias");
          router.push(`/email?${next}`, { scroll: false });
        }}
      />
    </div>
  );
}

// A PDF up to Drive, then recorded: ready for its link to go in an email
export function PdfUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const start = await startPdfUpload(file.name, file.size);
    if (start.error || !start.url || !start.id) {
      setBusy(false);
      return setError(start.error ?? "The upload couldn't start.");
    }
    const res = await fetch(start.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file }).catch(() => null);
    const drive = res?.ok ? await res.json().catch(() => null) : null;
    const done = drive?.id ? await finishPdfUpload(start.id, file.name, file.size, drive.id) : { error: "Google Drive didn't take the PDF." };
    setBusy(false);
    if (done.error) return setError(done.error);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-300">{error}</span>}
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-sm btn-glow flex items-center gap-1.5 disabled:opacity-60">
        <Upload size={14} /> {busy ? "Uploading…" : "Upload PDF"}
      </button>
    </span>
  );
}

// The PDF's tracked link, to paste into an email
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="btn btn-xs btn-ghost flex items-center gap-1"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function DeletePdf({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      message={`Delete "${name}"? Its link stops working, and the file goes to Google Drive's trash.`}
      onConfirm={async () => {
        await deletePdf(id);
        router.push("/email?tab=pdfs");
      }}
      className="btn btn-xs btn-ghost flex items-center gap-1 text-muted hover:text-rose-300"
    >
      <Trash2 size={12} /> Delete
    </ConfirmButton>
  );
}
