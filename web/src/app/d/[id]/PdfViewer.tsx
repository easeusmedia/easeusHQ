"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

const TICK_S = 5;

// The PDF, page under page, and a note every few seconds of the page most on
// screen while the tab is in front (lib/docTrack.ts). Rendered with PDF.js,
// whose worker is served from /public (npm run pdf-worker after updating it).
export function PdfViewer({ id, name, mailId }: { id: string; name: string; mailId: string | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const view = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let gone = false;
    const visible = new Map<number, number>();
    const send = (body: object) =>
      fetch("/api/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => null);

    // most of which page is on screen
    const watcher = new IntersectionObserver(
      (entries) => entries.forEach((e) => visible.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio)),
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    const timer = setInterval(() => {
      if (!view.current || document.visibilityState !== "visible") return;
      const [page, ratio] = [...visible.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
      if (page && ratio > 0) send({ kind: "tick", view: view.current, page, seconds: TICK_S });
    }, TICK_S * 1000);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument(`/d/${id}/file`).promise;
        if (gone) return;
        const started = await send({ kind: "start", doc: id, mailId, pages: pdf.numPages });
        view.current = started && started.ok ? ((await started.json()).view ?? null) : null;
        setState("ready");
        // ponytail: every page drawn up front; draw as they scroll in if long decks get slow
        for (let n = 1; n <= pdf.numPages && !gone; n++) {
          const page = await pdf.getPage(n);
          const width = Math.min(holder.current?.clientWidth ?? 900, 900);
          const fit = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / fit.width) * window.devicePixelRatio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.dataset.page = String(n);
          canvas.className = "mx-auto mb-4 block max-w-full rounded-sm bg-white shadow-lg";
          holder.current?.appendChild(canvas);
          watcher.observe(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch {
        if (!gone) setState("failed");
      }
    })();

    return () => {
      gone = true;
      clearInterval(timer);
      watcher.disconnect();
    };
  }, [id, mailId]);

  return (
    <div className="min-h-dvh bg-neutral-200 text-neutral-900">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-300 bg-white/95 px-4 py-3 backdrop-blur">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        <a
          href={`/d/${id}/file?download`}
          onClick={() => view.current && fetch("/api/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "download", view: view.current }), keepalive: true })}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          <Download size={14} /> Download
        </a>
      </header>
      <main className="px-4 py-6">
        {state === "loading" && <p className="py-20 text-center text-sm text-neutral-500">Opening…</p>}
        {state === "failed" && <p className="py-20 text-center text-sm text-neutral-500">This PDF couldn&apos;t be opened.</p>}
        <div ref={holder} className="mx-auto max-w-[900px]" />
      </main>
    </div>
  );
}
