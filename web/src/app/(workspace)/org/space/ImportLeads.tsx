"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { AtSign, Check, CircleAlert, Copy, FileText, FileUp, X } from "lucide-react";
import { ACCEPT, autoMap, buildLeads, columnsOf, fileProblem, halves, oneEach, partsOf, placeExtracted, readFile, targetsOf, Unreadable, type LeadIn, type Part, type Preview, type Row } from "@/lib/leadImport";
import type { BoardData } from "@/lib/space";
import { ADD_BUTTON, PlusBadge } from "../../AddButton";
import { closeOnBackdrop } from "../../dialog";
import { Reveal } from "../../Reveal";
import { extractLeads, fillImportedCountries, importLeads, mapColumns } from "./importActions";

const OFFLINE = "That couldn't be reached. Check your connection and try again.";
// leads a call, as add_leads takes them
const CHUNK = 50;
// leads a call whose countries are read, so the page's other actions never wait long behind them
const FILL_CHUNK = 30;
const plural = (n: number) => `${n} lead${n === 1 ? "" : "s"}`;

// what's happening now, and how far along when that can be counted
type Busy = { step: "read" | "place" | "extract" | "import"; at?: number; of?: number };
const said = (b: Busy) => (b.step === "import" && b.of ? `Importing ${plural(b.of)}` : "Importing the leads");

// A turning ring, a line for the step and a thin bar: filling when the work
// can be counted, sliding when it can't. Done, a tick and how many came in.
function Progress({ busy, added }: { busy: Busy | null; added: number | null }) {
  const share = busy?.of ? Math.max(0.04, (busy.at ?? 0) / busy.of) : null;
  return (
    <div role="status" aria-live="polite" className="fade-in flex flex-col items-center gap-3 px-4 py-9 text-sm">
      {added !== null ? (
        <span className="pop-in grid size-9 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
          <Check size={18} />
        </span>
      ) : (
        <svg viewBox="0 0 36 36" aria-hidden className="size-9 animate-spin [animation-duration:1.1s] motion-reduce:animate-none">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="26 94" />
        </svg>
      )}
      <p key={added !== null ? "done" : busy?.step} className="fade-in text-foreground/90">
        {added !== null ? `${plural(added)} added` : busy ? said(busy) : ""}
      </p>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/[0.06]">
        {added !== null ? (
          <div className="h-full w-full rounded-full bg-emerald-400/70" />
        ) : share !== null ? (
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${share * 100}%` }} />
        ) : (
          <div className="import-slide h-full w-1/3 rounded-full bg-accent/80" />
        )}
      </div>
    </div>
  );
}

// One kind of problem in the file: what it is, how many, the names (a short
// list that scrolls) and, for duplicates, the choice
function Problem({ Icon, title, names, children }: { Icon: typeof Copy; title: string; names: string[]; children?: React.ReactNode }) {
  return (
    <section className="fade-in rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-amber-300" />
        <p className="min-w-0 flex-1 text-sm text-foreground">{title}</p>
        {children}
      </div>
      <ul className="mt-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-muted">
        {names.map((n, i) => (
          <li key={i} className="truncate">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Import leads", where "New lead" was on a Sales board: a file of leads
// dropped or picked, read in the browser (lib/leadImport), its columns placed
// on the board's properties (by code, then one small Claude call for what
// code can't tell), then add_leads in fifties, into the board's first stage.
// A file with nothing to decide goes straight in; otherwise only what needs
// a decision shows (Abhishek, 23 Oct 2026): duplicates (skip or add anyway),
// leads missing details (the rest can go in without them) and leads nobody
// on them can be reached on yet (they can't go on to Ready to reach out
// until an email, Instagram or LinkedIn is added).
export function ImportLeads({ board }: { board: BoardData }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // the file read, with what it would bring in, while its problems are shown
  const [file, setFile] = useState<{ name: string; preview: Preview } | null>(null);
  // what's happening now (reading, importing), if anything
  const [busy, setBusy] = useState<Busy | null>(null);
  // how many came in, shown for a moment before it closes
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the duplicates: skipped, or added anyway
  const [twice, setTwice] = useState(false);
  // a file dragged over the window
  const [over, setOver] = useState(false);

  const targets = useMemo(() => targetsOf(board), [board]);

  function open() {
    setFile(null);
    setError(null);
    setBusy(null);
    setAdded(null);
    setTwice(false);
    ref.current?.showModal();
  }

  // Claude reads the parts one after another (Next sends a page's server
  // actions one at a time anyway), so one that fails stops the rest; a part
  // whose answer ran out of room or time is halved
  async function extract(parts: Part[]): Promise<Row[]> {
    const one = async (part: Part): Promise<Row[]> => {
      const res: Awaited<ReturnType<typeof extractLeads>> = await extractLeads(board.id, part).catch(() => ({ error: OFFLINE }));
      if (res.tooLong) {
        const h = halves(part);
        if (!h) throw new Unreadable("Part of that file holds too many leads to read at once. Split it into smaller files.");
        return [...(await one(h[0])), ...(await one(h[1]))];
      }
      if (res.error) throw new Unreadable(res.error);
      return res.rows ?? [];
    };
    const out: Row[] = [];
    for (let i = 0; i < parts.length; i++) {
      setBusy({ step: "extract", at: i, of: parts.length });
      out.push(...(await one(parts[i])));
    }
    return out;
  }

  async function take(f: File | undefined) {
    if (!f || busy) return;
    const problem = fileProblem(f);
    setError(problem);
    if (problem) return;
    setFile(null);
    setTwice(false);
    setBusy({ step: "read" });
    try {
      const read = await readFile(f);
      const rows = "rows" in read ? read.rows : await extract(partsOf(read));
      if (!rows.length) throw new Unreadable("There are no leads in that file to import.");
      const columns = columnsOf(rows);
      // what Claude read out (importActions extractLeads) is in the board's
      // own terms, placed as named, so only a file's own columns are asked about
      let mapping = "rows" in read ? autoMap(columns, board) : placeExtracted(columns, board);
      const left = columns.filter((c) => !mapping[c.path]);
      if (left.length) {
        setBusy({ step: "place" });
        const res: Awaited<ReturnType<typeof mapColumns>> = await mapColumns(
          board.id,
          left.map((c) => ({ path: c.path, samples: c.values.slice(0, 2).map((v) => v.slice(0, 60)) })),
        ).catch(() => ({ error: OFFLINE }));
        if (res.error) throw new Unreadable(res.error);
        mapping = { ...mapping, ...res.mapping };
      }
      const known = new Set(targets.map((t) => t.value));
      const preview = buildLeads(rows, oneEach(columns, Object.fromEntries(columns.map((c) => [c.path, known.has(mapping[c.path]) ? mapping[c.path] : "ignore"]))), board);
      if (!preview.leads.length && !preview.duplicates.length) throw new Unreadable(preview.incomplete.length ? "None of the leads in that file have the details the board needs." : "There are no leads in that file to import.");
      // nothing to decide: straight in (a value the board doesn't have is simply left off)
      if (!preview.duplicates.length && !preview.incomplete.length && !preview.unreachable.length) return await run(preview.leads, false);
      setFile({ name: f.name, preview });
    } catch (err) {
      if (!(err instanceof Unreadable)) console.error(err);
      setError(err instanceof Unreadable ? err.message : "That file couldn't be read.");
    }
    setBusy(null);
  }

  // the leads just added, their Country from their YouTube channels, in the
  // background; the board redrawn if any were filled
  async function fillLater(ids: string[]) {
    let filled = 0;
    for (let i = 0; i < ids.length; i += FILL_CHUNK) {
      const res = await fillImportedCountries(board.id, ids.slice(i, i + FILL_CHUNK)).catch(() => ({ filled: 0 }));
      filled += res.filled ?? 0;
    }
    if (filled) router.refresh();
  }

  // in fifties, with the bar filling; done, a tick for a moment, then it
  // closes and the board fills (refreshed after, as a redrawn board would
  // close it early)
  async function run(leads: LeadIn[], duplicates: boolean) {
    if (!leads.length) return;
    setError(null);
    let created = 0;
    const ids: string[] = [];
    const failed: string[] = [];
    for (let i = 0; i < leads.length; i += CHUNK) {
      setBusy({ step: "import", at: i, of: leads.length });
      const res: Awaited<ReturnType<typeof importLeads>> = await importLeads(board.id, leads.slice(i, i + CHUNK), duplicates).catch(() => ({ error: OFFLINE }));
      if (res.error) {
        failed.push(res.error);
        break;
      }
      created += res.created ?? 0;
      ids.push(...(res.ids ?? []));
      failed.push(...(res.failed ?? []).map((x) => `${x.title}: ${x.error}`));
    }
    if (!failed.length) {
      flushSync(() => {
        setBusy({ step: "import", at: leads.length, of: leads.length });
        setAdded(created);
      });
      await new Promise((r) => setTimeout(r, 1200));
      setBusy(null);
      ref.current?.close();
      void fillLater(ids);
      return router.refresh();
    }
    setBusy(null);
    if (created) router.refresh();
    void fillLater(ids);
    setError(`${created ? `${plural(created)} added. ` : ""}${failed[0]}${failed.length > 1 ? ` And ${failed.length - 1} more.` : ""}`);
  }

  const p = file?.preview;
  const going = p ? p.leads.length + (twice ? p.duplicates.length : 0) : 0;
  // the problems show until it's importing; the drop area until a file has them
  const showing = !!p && !busy && added === null;
  return (
    <>
      <button type="button" onClick={open} className={`${ADD_BUTTON} w-full`}>
        <PlusBadge /> Import leads
      </button>

      <dialog
        ref={ref}
        {...closeOnBackdrop}
        // a file dropped anywhere while it's open is the one to import, never opened by the browser
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-xs font-medium text-muted">Import leads</p>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-mr-1.5 flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <Reveal open={!showing}>
          <div className="px-5 pt-3 pb-5">
            {busy || added !== null ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
                <Progress busy={busy} added={added} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className={`fade-in flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed px-4 py-10 text-sm transition-colors ${
                  over ? "border-accent/60 bg-accent/[0.06] text-foreground" : "border-white/15 bg-white/[0.02] text-muted hover:border-white/25 hover:text-foreground"
                }`}
              >
                <FileUp size={20} />
                Drop a file here, or choose one
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                take(e.target.files?.[0]);
                e.target.value = ""; // picking the same file again still counts
              }}
            />
          </div>
        </Reveal>

        <Reveal open={showing}>
          {p && (
            <div className="flex flex-col gap-3 px-5 pt-3 pb-5">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="btn btn-sm btn-ghost ml-auto shrink-0">
                  Choose another
                </button>
              </div>
              {p.duplicates.length > 0 && (
                <Problem Icon={Copy} title={`${p.duplicates.length === 1 ? "1 lead is" : `${p.duplicates.length} leads are`} already on the board`} names={p.duplicates.map((l) => l.title)}>
                  <div aria-label="Duplicates" className="flex shrink-0 rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/[0.07]">
                    {[
                      { on: false, label: "Skip them" },
                      { on: true, label: "Add anyway" },
                    ].map((o) => (
                      <button key={o.label} type="button" aria-pressed={twice === o.on} onClick={() => setTwice(o.on)} className="seg rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Problem>
              )}
              {p.incomplete.length > 0 && (
                <Problem Icon={CircleAlert} title={`${p.incomplete.length === 1 ? "1 lead is" : `${p.incomplete.length} leads are`} missing details and can't be imported`} names={p.incomplete.map((x) => `${x.name}: ${x.why}`)} />
              )}
              {p.unreachable.length > 0 && (
                <Problem Icon={AtSign} title={`${p.unreachable.length === 1 ? "1 lead has" : `${p.unreachable.length} leads have`} no email, LinkedIn or Instagram`} names={p.unreachable} />
              )}
            </div>
          )}
        </Reveal>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
          <p className="line-clamp-2 min-w-0 text-xs text-red-300" title={error ?? undefined}>
            {error}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
              Cancel
            </button>
            {showing && (
              <button type="button" disabled={!going} onClick={() => p && run(twice ? [...p.leads, ...p.duplicates] : p.leads, twice)} className="fade-in btn btn-glow disabled:opacity-60">
                {!going ? "Nothing to import" : p.incomplete.length ? `Import the other ${plural(going)}` : `Import ${plural(going)}`}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
