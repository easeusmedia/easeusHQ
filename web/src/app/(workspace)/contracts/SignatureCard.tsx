"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Trash2, Upload } from "lucide-react";
import { ConfirmButton } from "../ConfirmButton";
import { saveProviderSignature } from "./actions";

// Ashmit's signature, uploaded once and put on our side of every contract.
// A photo of a signature on paper works: the paper is made transparent,
// the ink trimmed to its edges, and the image kept small.
async function clean(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1200 / img.width, 500 / img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    let [x0, y0, x1, y1] = [w, h, -1, -1];
    for (let i = 0; i < px.length; i += 4) {
      // light paper fades out, ink stays — with a soft edge, not a jagged one
      const light = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const alpha = Math.max(0, Math.min(255, (215 - light) * 4)) * (px[i + 3] / 255);
      px[i + 3] = alpha;
      if (alpha > 40) {
        const p = i / 4;
        const x = p % w;
        const y = (p - x) / w;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) throw new Error("No signature found in that image — try one with dark ink on a light background.");
    ctx.putImageData(data, 0, 0);
    const pad = 6;
    const cw = Math.min(w, x1 - x0 + 1 + pad * 2);
    const ch = Math.min(h, y1 - y0 + 1 + pad * 2);
    const out = document.createElement("canvas");
    const fit = Math.min(1, 600 / cw);
    out.width = Math.round(cw * fit);
    out.height = Math.round(ch * fit);
    out.getContext("2d")!.drawImage(canvas, Math.max(0, x0 - pad), Math.max(0, y0 - pad), cw, ch, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SignatureCard({ image }: { image: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await saveProviderSignature(await clean(file));
      if (res.error) setError(res.error);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.06] bg-surface/50 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <PenLine size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Ashmit&apos;s signature</p>
        <p className="text-xs text-muted">
          {image ? "Signed on every contract, dated the day it goes out — only the client signs." : "Upload it once and every contract comes signed on our side."}
        </p>
        {error && <p className="fade-in mt-1 text-xs text-accent">{error}</p>}
      </div>
      {image && (
        <span className="flex h-12 w-40 items-center justify-center rounded-lg bg-white px-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small data: image */}
          <img src={image} alt="Ashmit's signature" className="max-h-10 max-w-full object-contain" />
        </span>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn btn-glow flex items-center gap-1.5 disabled:opacity-60">
          <Upload size={14} /> {busy ? "Saving…" : image ? "Replace" : "Upload"}
        </button>
        {image && (
          <ConfirmButton
            message="Remove Ashmit's signature? Contracts will then need him to sign each one himself."
            onConfirm={async () => {
              await saveProviderSignature(null);
              router.refresh();
            }}
            className="btn btn-ghost px-2.5"
          >
            <Trash2 size={14} />
          </ConfirmButton>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
