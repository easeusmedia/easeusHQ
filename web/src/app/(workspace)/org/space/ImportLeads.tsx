"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { AtSign, Check, CircleAlert, Copy, FileText, FileUp, X } from "lucide-react";
import { ACCEPT, autoMap, buildLeads, columnsOf, fileProblem, halves, oneEach, partsOf, placeable, placeExtracted, readFile, tagsToAsk, unreachable, Unreadable, type LeadIn, type Part, type Preview, type Read, type Row } from "@/lib/leadImport";
import { boardNames, fillTemplates, findSlots, misplacedVars } from "@/lib/leadTemplates";
import type { BoardData } from "@/lib/space";
import { ADD_BUTTON, PlusBadge } from "../../AddButton";
import { closeOnBackdrop } from "../../dialog";
import { Reveal } from "../../Reveal";
import { SAMPLE } from "./importClaude";
import { extractLeads, findContacts, importLeads, mapColumns, matchTags, nameSlots } from "./importActions";

const OFFLINE = "That couldn't be reached. Check your connection and try again.";
// leads a call, as add_leads takes them
const CHUNK = 50;
// leads a call whose links are read (importActions findContacts), well inside the page's minute
const FIND = 20;
const plural = (n: number) => `${n} lead${n === 1 ? "" : "s"}`;

// Several files as one import: their rows together, and their words and
// pictures together, so a few screenshots of one list are read in the same
// parts (two pictures a call) and any decision is asked once
export function together(reads: Read[]) {
  const loose = reads.flatMap((r) => ("rows" in r ? [] : [r]));
  return {
    rows: reads.flatMap((r) => ("rows" in r ? r.rows : [])),
    loose: loose.length ? { text: loose.map((r) => r.text).join("\n"), images: loose.flatMap((r) => r.images) } : null,
  };
}

// What's pasted into the dialog, as files. Cells copied from a spreadsheet
// (a tab on every line) are a table, read without Claude. Copied from a
// spreadsheet or a document, the words come with a picture of them, and the
// words are what's read; a picture or a file alone is itself.
export function pasted(text: string, files: File[]): File[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (files.length && lines.length < 2) return files;
  return lines.length ? [new File([text], lines.length > 1 && lines.every((l) => l.includes("\t")) ? "pasted.tsv" : "pasted.txt", { type: "text/plain" })] : [];
}

// Claude reads the parts one after another (Next sends a page's server
// actions one at a time anyway), so one that fails stops the rest. A part
// whose answer ran out of room is halved, and so is every part after it: a
// file is as dense throughout, so no other part pays for a cut-off answer.
// Nothing more is asked once the dialog is closed (gone).
export async function readParts(parts: Part[], ask: (p: Part) => Promise<{ rows?: Row[]; tooLong?: boolean; error?: string }>, gone: () => boolean, onPart: (at: number, of: number) => void): Promise<Row[]> {
  let dense = false;
  const one = async (part: Part): Promise<Row[]> => {
    if (gone()) return [];
    const res = await ask(part);
    if (res.tooLong) {
      dense = true;
      const h = halves(part);
      if (!h) throw new Unreadable("Part of that file holds too many leads to read at once. Split it into smaller files.");
      return [...(await one(h[0])), ...(await one(h[1]))];
    }
    if (res.error) throw new Unreadable(res.error);
    return res.rows ?? [];
  };
  const out: Row[] = [];
  for (const [i, part] of parts.entries()) {
    if (gone()) break;
    onPart(i, parts.length);
    for (const p of (dense && halves(part)) || [part]) out.push(...(await one(p)));
  }
  return out;
}

// Each lead's contacts from its links, twenty a call, one call after
// another (a page's actions go one at a time anyway). Only what a lead's
// links can change comes back (its contacts and Country); a call that fails
// leaves its leads as they were, read again once they're imported, as are
// the leads it couldn't read in time (unread). Nothing more is asked once the
// dialog is closed (gone).
type Found = { leads?: Pick<LeadIn, "contacts" | "values">[]; unread?: string[]; error?: string };
export async function findAll(leads: LeadIn[], ask: (ls: LeadIn[]) => Promise<Found>, gone: () => boolean, onPart: (at: number, of: number) => void): Promise<{ leads: LeadIn[]; unread: string[] }> {
  const out = [...leads];
  const unread: string[] = [];
  for (let i = 0; i < leads.length && !gone(); i += FIND) {
    onPart(i, leads.length);
    const part = leads.slice(i, i + FIND);
    const res = await ask(part.map(({ title, contacts, links, values }) => ({ title, contacts, links, values }))).catch((): Found => ({ error: OFFLINE }));
    if (res.leads?.length === part.length) res.leads.forEach((l, j) => (out[i + j] = { ...part[j], contacts: l.contacts, values: l.values }));
    else unread.push(...part.map((l) => l.title));
    unread.push(...(res.unread ?? []));
  }
  return { leads: out, unread };
}

// add_leads' calls: the new leads in fifties (a title already on the board
// is skipped, so sending one again is harmless), then the duplicates added anyway
export type Batch = { leads: LeadIn[]; twice: boolean };
export function batchesOf(leads: LeadIn[], dups: LeadIn[]): Batch[] {
  const cut = (ls: LeadIn[], twice: boolean) => Array.from({ length: Math.ceil(ls.length / CHUNK) }, (_, i) => ({ leads: ls.slice(i * CHUNK, (i + 1) * CHUNK), twice }));
  return [...cut(leads, false), ...cut(dups, true)];
}
// What didn't go in: every batch from the one that failed (from), and the
// leads add_leads turned down (refused, by title as add_leads keeps it)
export function unsent(batches: Batch[], from: number, refused: Set<string>) {
  const left = (twice: boolean) => batches.flatMap((b, i) => (b.twice !== twice ? [] : i >= from ? b.leads : b.leads.filter((l) => refused.has(l.title.trim().replace(/\s+/g, " ")))));
  return { leads: left(false), duplicates: left(true) };
}

// Why Claude couldn't place the columns code can't, and which ones an import now leaves out
export const leftOut = (why: string, columns: string[]) =>
  `${why} Importing now leaves out ${new Intl.ListFormat("en-GB").format(columns.length > 4 ? [...columns.slice(0, 3), `${columns.length - 3} more`] : columns)}.`;

// what's happening now, and how far along when that can be counted
type Busy = { step: "read" | "place" | "extract" | "find" | "import"; at?: number; of?: number };
const said = (b: Busy) => (b.step === "find" ? "Finding contacts" : b.step === "import" && b.of ? `Importing ${plural(b.of)}` : "Importing the leads");

// A turning ring, a line for the step and a thin bar: filling when the work
// can be counted, sliding when it can't. Done, a tick and how many came in.
function Progress({ busy, added, skipped = 0 }: { busy: Busy | null; added: number | null; skipped?: number }) {
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
        {added !== null ? (added === 0 && skipped ? `All ${plural(skipped)} were already on the board` : `${plural(added)} added`) : busy ? said(busy) : ""}
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

// "Import leads", where "New lead" was on a Sales board: files of leads
// dropped, picked or pasted, read in the browser (lib/leadImport), its columns placed
// on the board's properties (by code, then one Claude call for what code
// can't tell, and one for values code can't put on a property's tags),
// each lead's contacts found from its links (its Notion
// pages, channel, website), then add_leads in fifties, into the board's
// first stage. A file with nothing to decide goes straight in; otherwise
// only what needs a decision shows (Abhishek, 23 Oct 2026): duplicates (skip
// or add anyway), leads without a name (the rest can go in without them;
// a property the board requires never keeps one out, it's left empty)
// and leads nobody on them can be reached on even after their links were
// read (they can't go on to Ready to reach out until an email, Instagram or
// LinkedIn is added).
export function ImportLeads({ board }: { board: BoardData }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // the file read, with what it would bring in, while its problems are shown;
  // unread: the leads whose links are read again once they're imported
  const [file, setFile] = useState<{ name: string; preview: Preview; unread: string[] } | null>(null);
  // what's happening now (reading, importing), if anything
  const [busy, setBusy] = useState<Busy | null>(null);
  // how many came in, shown for a moment before it closes
  const [added, setAdded] = useState<number | null>(null);
  const [skippedN, setSkippedN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // the duplicates: skipped, or added anyway
  const [twice, setTwice] = useState(false);
  // a file dragged over the window
  const [over, setOver] = useState(false);
  // goes up each time the dialog opens or closes: work started before (the
  // dialog closed meanwhile) stops at its next step and changes nothing here
  const session = useRef(0);

  const known = useMemo(() => placeable(board), [board]);

  function open() {
    session.current++;
    setFile(null);
    setError(null);
    setBusy(null);
    setAdded(null);
    setTwice(false);
    ref.current?.showModal();
  }

  async function take(files: File[]) {
    if (!files.length || busy) return;
    const s = session.current;
    const gone = () => s !== session.current;
    // with several files, which one a problem is in
    const whose = (f: File, why: string) => (files.length > 1 ? `${f.name}: ${why}` : why);
    const bad = files.find(fileProblem);
    const problem = bad ? whose(bad, fileProblem(bad)!) : null;
    setError(problem);
    if (problem) return;
    setFile(null);
    setTwice(false);
    setBusy({ step: "read" });
    try {
      const reads = await Promise.all(
        files.map((f) =>
          readFile(f).catch((err) => {
            throw err instanceof Unreadable ? new Unreadable(whose(f, err.message)) : err;
          }),
        ),
      );
      if (gone()) return;
      const { rows: table, loose } = together(reads);
      const found = loose ? await readParts(partsOf(loose), (p) => extractLeads(board.id, p).catch(() => ({ error: OFFLINE })), gone, (at, of) => setBusy({ step: "extract", at, of })) : [];
      if (gone()) return;
      const rows = [...table, ...found];
      if (!rows.length) throw new Unreadable("There are no leads in that file to import.");
      const columns = columnsOf(rows);
      // what Claude read out (importActions extractLeads) is in the board's
      // own terms, placed as named, so only a file's own columns are asked about
      let mapping = { ...placeExtracted(columnsOf(found), board), ...autoMap(columnsOf(table), board) };
      const left = columns.filter((c) => !mapping[c.path]);
      // why Claude couldn't place the rest, if it couldn't: they're left out,
      // and the person says whether to import without them
      let unplaced: string | null = null;
      if (left.length) {
        setBusy({ step: "place" });
        const res: Awaited<ReturnType<typeof mapColumns>> = await mapColumns(
          board.id,
          left.map((c) => ({ path: c.path, samples: c.values.slice(0, 2).map((v) => v.slice(0, SAMPLE)) })),
          Object.entries(mapping).map(([path, target]) => ({ path, target })),
        ).catch(() => ({ error: OFFLINE }));
        if (gone()) return;
        if (res.mapping) mapping = { ...mapping, ...res.mapping };
        else unplaced = res.error ?? OFFLINE;
      }
      const placed = oneEach(columns, Object.fromEntries(columns.map((c) => [c.path, known(mapping[c.path]) ? mapping[c.path] : "ignore"])));
      // values code can't put on a property's tags, matched by Claude; unmatched, left empty
      const asks = tagsToAsk(rows, placed, board);
      const told: Awaited<ReturnType<typeof matchTags>> = asks.length ? await matchTags(board.id, asks).catch(() => ({ error: OFFLINE })) : {};
      if (gone()) return;
      // Claude couldn't match them: they'd go in empty, so the person says whether to import
      const untagged = told.error ? leftOut(told.error, asks.map((a) => a.column)) : null;
      let built = buildLeads(rows, placed, board, told.tags ?? {});
      // a column put on a variable that the file's own messages have other words in the place of isn't that variable
      const wrong = misplacedVars([...built.leads, ...built.duplicates], board.messages);
      if (wrong.length) built = buildLeads(rows, Object.fromEntries(Object.entries(placed).map(([p, t]) => [p, wrong.includes(t.slice(4)) && t.startsWith("var:") ? "ignore" : t])), board, told.tags ?? {});
      if (!built.leads.length && !built.duplicates.length) throw new Unreadable(unplaced ?? (built.incomplete.length ? "None of the leads in that file have a name." : "There are no leads in that file to import."));
      // messages written out for each lead come in as fill-in-the-blank
      // templates with the lead's values (lib/leadTemplates); unnamed by
      // Claude, a blank is named from the words beside it
      const plan = findSlots([...built.leads, ...built.duplicates]);
      // a blank where the board's own wording has a variable is that one; Claude names the rest
      const fixed = boardNames(plan, board.messages, [...new Set([...built.leads, ...built.duplicates].flatMap((l) => Object.keys(l.vars ?? {})))]);
      const unnamed = plan.slots.filter((x) => !fixed[x.id]);
      const named: Awaited<ReturnType<typeof nameSlots>> = unnamed.length ? await nameSlots(board.id, unnamed).catch(() => ({})) : {};
      if (gone()) return;
      const names = { ...named.names, ...fixed };
      const filled = [...fillTemplates(built.leads, plan, names), ...fillTemplates(built.duplicates, plan, names)];
      // their contacts from their links, so who can't be reached is known from what's there
      const people = board.fields.some((f) => f.kind === "contacts");
      const reached = people ? await findAll(filled, (ls) => findContacts(board.id, ls), gone, (at, of) => setBusy({ step: "find", at, of })) : { leads: filled, unread: filled.map((l) => l.title) };
      if (gone()) return;
      const leads = reached.leads.slice(0, built.leads.length);
      const unread = new Set(reached.unread);
      const preview = { ...built, leads, duplicates: reached.leads.slice(built.leads.length), unreachable: people ? unreachable(leads.filter((l) => !unread.has(l.title))) : [] };
      // kept while it imports, so a call that fails leaves the rest to import again
      setFile({ name: files.length > 1 ? `${files.length} files` : files[0].name, preview, unread: reached.unread });
      // nothing to decide: straight in (a value the board doesn't have is simply left off)
      if (!unplaced && !untagged && !preview.duplicates.length && !preview.incomplete.length && !preview.unreachable.length) return await run(preview.leads, [], reached.unread, s);
      if (unplaced || untagged) setError([unplaced && leftOut(unplaced, left.map((c) => c.path)), untagged].filter(Boolean).join(" "));
    } catch (err) {
      if (!(err instanceof Unreadable)) console.error(err);
      if (gone()) return;
      setError(err instanceof Unreadable ? err.message : "That file couldn't be read.");
    }
    setBusy(null);
  }

  // the server reads again, after each batch, the links of leads it couldn't
  // read in time (importActions importLeads); the board is refreshed as that lands
  function refreshLater() {
    for (const ms of [15_000, 45_000]) setTimeout(() => router.refresh(), ms);
  }

  // in fifties, with the bar filling; done, a tick for a moment, then it
  // closes and the board fills (refreshed after, as a redrawn board would
  // close it early). A call that fails leaves only what didn't go in to
  // import again; closed meanwhile, it stops before the next call.
  async function run(leads: LeadIn[], dups: LeadIn[], unread: string[], s = session.current) {
    const live = () => s === session.current;
    const batches = batchesOf(leads, dups);
    if (!batches.length) return;
    setError(null);
    const total = leads.length + dups.length;
    let created = 0;
    let skipped = 0;
    let sent = 0;
    let stop = batches.length;
    const failed: string[] = [];
    const refused = new Set<string>();
    for (const [i, b] of batches.entries()) {
      if (!live()) break;
      setBusy({ step: "import", at: sent, of: total });
      const late = b.leads.filter((l) => unread.includes(l.title)).map((l) => l.title);
      const res: Awaited<ReturnType<typeof importLeads>> = await importLeads(board.id, b.leads, b.twice, late).catch(() => ({ error: OFFLINE }));
      if (res.error) {
        failed.push(res.error);
        stop = i;
        break;
      }
      sent += b.leads.length;
      created += res.created ?? 0;
      skipped += res.skipped ?? 0;
      for (const x of res.failed ?? []) {
        refused.add(x.title);
        failed.push(`${x.title}: ${x.error}`);
      }
    }
    if (live() && !failed.length) {
      flushSync(() => {
        setBusy({ step: "import", at: total, of: total });
        setSkippedN(skipped);
        setAdded(created);
      });
      await new Promise((r) => setTimeout(r, 1200));
      if (live()) {
        setBusy(null);
        ref.current?.close();
      }
    } else if (live()) {
      setBusy(null);
      const rest = unsent(batches, stop, refused);
      const still = new Set([...rest.leads, ...rest.duplicates].map((l) => l.title));
      setFile((f) => f && { ...f, preview: { ...f.preview, ...rest, unreachable: f.preview.unreachable.filter((t) => still.has(t)) } });
      setError(`${created ? `${plural(created)} added. ` : ""}${failed[0]}${failed.length > 1 ? ` And ${failed.length - 1} more.` : ""}`);
    }
    if (created) {
      router.refresh();
      if (unread.length) refreshLater();
    }
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
        // closed however (Cancel, X, the backdrop, Escape, done), what's still running stops
        onClose={() => session.current++}
        // files dropped anywhere while it's open are the ones to import, never opened by the browser
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take([...e.dataTransfer.files]);
        }}
        // pasted: a screenshot, or copied cells or text
        onPaste={(e) => {
          const files = pasted(e.clipboardData.getData("text/plain"), [...e.clipboardData.files]);
          if (!files.length) return;
          e.preventDefault();
          take(files);
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
                <Progress busy={busy} added={added} skipped={skippedN} />
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
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = ""; // picking the same file again still counts
                take(files);
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
              <button type="button" disabled={!going} onClick={() => p && run(p.leads, twice ? p.duplicates : [], file.unread)} className="fade-in btn btn-glow disabled:opacity-60">
                {!going ? "Nothing to import" : p.incomplete.length ? `Import the other ${plural(going)}` : `Import ${plural(going)}`}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
