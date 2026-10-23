"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Copy, FileText, FileUp, Tag, UserPlus, X } from "lucide-react";
import { ACCEPT, autoMap, buildLeads, columnsOf, fileProblem, halves, partsOf, placeExtracted, readFile, targetsOf, Unreadable, type Column, type Part, type Row, type Target } from "@/lib/leadImport";
import type { BoardData } from "@/lib/space";
import { ADD_BUTTON, PlusBadge } from "../../AddButton";
import { closeOnBackdrop } from "../../dialog";
import { Dropdown } from "../../Dropdown";
import { Reveal } from "../../Reveal";
import { StatTile } from "../../StatTile";
import { extractLeads, importLeads, mapColumns } from "./importActions";

const OFFLINE = "That couldn't be reached. Check your connection and try again.";
// leads a call, as add_leads takes them
const CHUNK = 50;
const plural = (n: number) => `${n} lead${n === 1 ? "" : "s"}`;

type Loaded = { name: string; rows: Row[]; columns: Column[]; mapping: Record<string, Target> };

// "Import leads", where "New lead" was on a Sales board: a file of leads
// dropped or picked, read in the browser (lib/leadImport), its columns placed
// on the board's properties (by code, then one small Claude call for what
// code can't tell, each fixable by hand), a preview of what will come in,
// then add_leads in fifties. They always land in the board's first stage.
export function ImportLeads({ board }: { board: BoardData }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // the file read, kept while picking another so the preview keeps its words as it folds
  const [file, setFile] = useState<Loaded | null>(null);
  const [picking, setPicking] = useState(true);
  // what's happening now (reading, placing, importing), if anything
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a file dragged over the window
  const [over, setOver] = useState(false);

  const targets = useMemo(() => targetsOf(board), [board]);
  const preview = useMemo(() => (file ? buildLeads(file.rows, file.mapping, board) : null), [file, board]);
  const required = board.fields.filter((f) => f.required).map((f) => f.name);

  function open() {
    setFile(null);
    setPicking(true);
    setError(null);
    setBusy(null);
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
      setBusy(`Reading the leads, ${i} of ${parts.length}…`);
      out.push(...(await one(parts[i])));
    }
    return out;
  }

  async function take(f: File | undefined) {
    if (!f || busy) return;
    const problem = fileProblem(f);
    setError(problem);
    if (problem) return;
    setBusy("Reading the file…");
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
        setBusy("Placing the columns…");
        const res: Awaited<ReturnType<typeof mapColumns>> = await mapColumns(
          board.id,
          left.map((c) => ({ path: c.path, samples: c.values.slice(0, 2).map((v) => v.slice(0, 60)) })),
        ).catch(() => ({ error: OFFLINE }));
        // without Claude, they're placed by hand
        if (res.error) setError(res.error);
        mapping = { ...mapping, ...res.mapping };
      }
      const known = new Set(targets.map((t) => t.value));
      setFile({ name: f.name, rows, columns, mapping: Object.fromEntries(columns.map((c) => [c.path, known.has(mapping[c.path]) ? mapping[c.path] : "ignore"])) });
      setPicking(false);
    } catch (err) {
      if (!(err instanceof Unreadable)) console.error(err);
      setError(err instanceof Unreadable ? err.message : "That file couldn't be read.");
    }
    setBusy(null);
  }

  async function submit() {
    const leads = preview?.leads ?? [];
    if (!leads.length || busy) return;
    setError(null);
    let created = 0;
    const failed: string[] = [];
    for (let i = 0; i < leads.length; i += CHUNK) {
      setBusy(`Importing ${Math.min(i + CHUNK, leads.length)} of ${leads.length}…`);
      const res: Awaited<ReturnType<typeof importLeads>> = await importLeads(board.id, leads.slice(i, i + CHUNK)).catch(() => ({ error: OFFLINE }));
      if (res.error) {
        failed.push(res.error);
        break;
      }
      created += res.created ?? 0;
      failed.push(...(res.failed ?? []).map((x) => `${x.title}: ${x.error}`));
    }
    setBusy(null);
    if (created) router.refresh();
    if (!failed.length) return ref.current?.close();
    setError(`${created ? `${plural(created)} added. ` : ""}${failed[0]}${failed.length > 1 ? ` And ${failed.length - 1} more.` : ""}`);
  }

  const count = preview?.leads.length ?? 0;
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
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
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

        <Reveal open={picking}>
          <div className="px-5 pt-3 pb-5">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => input.current?.click()}
              className={`flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed px-4 py-10 text-sm transition-colors disabled:cursor-default ${
                over ? "border-accent/60 bg-accent/[0.06] text-foreground" : "border-white/15 bg-white/[0.02] text-muted hover:border-white/25 hover:text-foreground"
              }`}
            >
              <FileUp size={20} className={busy ? "animate-pulse" : ""} />
              {busy ?? "Drop a file here, or choose one"}
            </button>
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

        <Reveal open={!picking && !!file}>
          {file && preview && (
            <div className="flex flex-col gap-4 px-5 pt-3 pb-5">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate">{file.name}</span>
                <button type="button" disabled={!!busy} onClick={() => setPicking(true)} className="btn btn-sm btn-ghost ml-auto shrink-0">
                  Choose another
                </button>
              </div>

              <div className="grid grid-cols-2 rounded-xl border border-white/[0.07] bg-foreground/[0.02] sm:grid-cols-4">
                <StatTile bare label="New leads" value={count} Icon={UserPlus} />
                <StatTile bare label="Already on the board" value={preview.existing} Icon={Copy} />
                <div title={[`${preview.unnamed} without a name`, ...(required.length ? [`${preview.missing} without ${required.join(" or ")}`] : [])].join("\n")}>
                  <StatTile bare label="Missing details" value={preview.unnamed + preview.missing} Icon={CircleAlert} />
                </div>
                <div title={preview.unmatched.join("\n")}>
                  <StatTile bare label="Not in the tags" value={preview.unmatched.length} Icon={Tag} />
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-white/[0.07]">
                {file.columns.map((c) => (
                  <div key={c.path} className="flex items-center gap-3 border-b border-white/[0.05] px-3 py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground" title={c.path}>
                        {c.path}
                      </p>
                      <p className="truncate text-xs text-muted" title={c.values[0]}>
                        {c.values[0]}
                      </p>
                    </div>
                    <div className="w-40 shrink-0 sm:w-52">
                      <Dropdown size="sm" value={file.mapping[c.path]} options={targets} onChange={(v) => setFile({ ...file, mapping: { ...file.mapping, [c.path]: v } })} />
                    </div>
                  </div>
                ))}
              </div>
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
            <button type="button" disabled={!!busy || picking || !count} onClick={submit} className="btn btn-glow disabled:opacity-60">
              {busy && !picking ? busy : count && !picking ? `Import ${plural(count)}` : "Import leads"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
