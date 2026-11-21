"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ChevronUp, Filter, LayoutGrid, Layers, List, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Checkbox } from "../Checkbox";
import { closeOnBackdrop } from "../dialog";
import { GroupingSetting } from "./BillingPanel";
import { AddProjectCard } from "./AddProjectCard";
import { ProjectCard, ProjectRow, type ProjectCardData } from "./ProjectCard";
import { paramOrProp, setParam } from "../urlState";
import { batchItems, invoiceBatches, newBatchKey, pinsAfterMove, type BillingRule } from "@/lib/invoiceBatches";
import { arrangeProject, moveProjectToInvoice, renameInvoice } from "./actions";
import { EditableName } from "../EditableName";
import { topLayer, usePopover, useCloseOnScroll } from "../popover";
import { moveTo as moveInOrder } from "@/lib/reorder";
import { DropSlot, landingIndex, useEaseAside } from "../DropSlot";
import type { PlanItem } from "@/lib/contentPlan";
import { Reveal } from "../Reveal";
import { DatePicker } from "../DatePicker";

// the latest few, before "+N more"
// 5 projects before "+N more", by invoice or not (Abhishek, 21 Nov 2026)
const LATEST = 5;
// by invoice, or the latest; "-all" once "+N more" is pressed
const VIEWS = ["invoice", "invoice-all", "latest", "all"] as const;
type View = (typeof VIEWS)[number];

// Projects already come in most-recent-first. Default view is just the
// last few — a client with a year of episodes shouldn't dump all of them
// on the page at once; "+N more" shows the rest, and search and Filter
// narrow them down.
//
// What's on show lives in the URL (?show=), for the same reason the open tab
// does: expanding to all 22 projects, opening one, and pressing Back used to
// collapse straight back to 4 — the project you'd just been looking at
// wasn't even on the page any more. It also has to be in the URL for scroll
// restoration to have anything to restore *to*, since it decides how tall
// this page is (see MainScroll).
export function ProjectsSection({
  clientId,
  projects,
  initialShow,
  initialLayout,
  billing,
  today,
  projectBase,
  canMoveInvoices = false,
  plan,
  billingOrder,
  invoiceNames = {},
  canSetGrouping = false,
}: {
  clientId: string;
  projects: ProjectCardData[];
  initialShow?: string;
  // ?layout=list from the server, for the first paint
  initialLayout?: string;
  // the client's invoicing rule (Billing tab), for "show one invoice's worth"
  billing: BillingRule;
  // yyyy-mm-dd, from the server, so "is this invoice due yet" can't differ
  // between the server's render and the browser's
  today: string;
  // the client's own page: where its projects open (…/<id>), and no adding
  // or deleting. A string, not a function — this comes from a server page.
  projectBase?: string;
  // ops: drag a finished project from one invoice to another
  canMoveInvoices?: boolean;
  // the client's content blueprint, for a new project's planned tasks
  plan?: PlanItem[];
  // the ids in the order invoices count them in (lib/projectOrder), so
  // dragging a card never moves it to another invoice; else as listed
  billingOrder?: string[];
  // names given to invoices by hand (Client.invoiceNames), shown instead of "Batch 6"
  invoiceNames?: Record<string, string>;
  // Level 1: how the projects are grouped, set here (GroupingSetting)
  canSetGrouping?: boolean;
}) {
  // "invoice": every project, in sections, one per invoice ("invoice-all"
  // once "+N more" is pressed); "latest": the last few; "all": every one.
  // Null: the default, worked out below once the invoices are known.
  const [picked, setPreset] = useState<View | null>(() => {
    const show = paramOrProp("show", initialShow);
    return (VIEWS as readonly string[]).includes(show ?? "") ? (show as View) : null;
  });
  // a project found by its name, whatever the view (Abhishek, 21 Nov 2026)
  const [query, setQuery] = useState("");
  // narrowed to what needs managing (Abhishek, 21 Nov 2026): where each one
  // is, and whether it's been paid for
  const [status, setStatus] = useState<"all" | "progress" | "done">("all");
  // and from when to when (yyyy-mm-dd, on the day it was finished, else made)
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // covers in a grid, or one project a row (?layout=list)
  const [list, setList] = useState(() => paramOrProp("layout", initialLayout) === "list");
  // "+N more" pressed here: the projects it adds ease in, and only they
  // (Abhishek, 21 Nov 2026: the whole list flickered)
  const [grew, setGrew] = useState(false);
  // a moment before it grows, for the "+N more" card to fade out first
  const [phase, setPhase] = useState<"growing" | null>(null);
  // just folded: the "+N more" card eases back in
  const [folded, setFolded] = useState(false);

  // A move shows at once: its pins apply here until the saved ones arrive
  // with the refreshed projects (a new `projects` array drops them).
  const [optimistic, setOptimistic] = useState<{ base: ProjectCardData[]; pins: Record<string, string> } | null>(null);
  const pins = optimistic?.base === projects ? optimistic.pins : {};
  const billed = new Map(billingOrder?.map((id, i) => [id, i]));
  // Every project is in an invoice (Abhishek, 21 Nov 2026: "why Not finished
  // yet?"): finished work by its day (marked Completed counts, with or
  // without a finish date: Notion's often have none), and what's still being
  // made after it, in the invoice that's open, as it will be billed
  const finished = (p: ProjectCardData) => p.status === "completed" || !!p.completedAt;
  const batches = invoiceBatches(
    batchItems(
      [...projects]
        .sort((a, b) => (billed.get(a.id) ?? 0) - (billed.get(b.id) ?? 0))
        .map((p) => ({ id: p.id, finished: finished(p), date: p.date, pin: pins[p.id] ?? p.invoiceBatch })),
      today
    ),
    billing,
    today
  ).map((b) => (invoiceNames[b.key] ? { ...b, label: invoiceNames[b.key] } : b));
  // Opened by invoice wherever there are invoices (Abhishek, 21 Nov 2026:
  // "organise the projects with the invoice batching"), the client's own
  // page too; there each invoice's paid state shows, never changed
  const defaultView: View = batches.length ? "invoice" : "latest";
  const preset = picked ?? defaultView;
  const nextKey = newBatchKey(batches, billing);
  const canMove = canMoveInvoices && !projectBase;
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Dragging a project to a new place among those shown, in the Projects
  // view, grid or list (Abhishek, 27 Oct 2026); invoice moves stay in By
  // invoice. Ops only, as moving invoices is. While it's dragged, a slot of
  // its size shows where it will land (DropSlot), and the drop saves at once.
  const [landAt, setLandAt] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const dragged = useRef<HTMLElement | null>(null);
  const arrangeRef = useRef<HTMLElement | null>(null);
  // a drop shows at once: each move still being saved applies on top of
  // whatever projects arrive (an earlier move's refresh included), so a card
  // never slides back while its save is on the way, as on the boards
  const [, startTransition] = useTransition();
  const [ordered, applyArrange] = useOptimistic(projects, (cur, m: { id: string; before: string | null; after: string | null }) => {
    const byId = new Map(cur.map((p) => [p.id, p]));
    const ids = cur.map((p) => p.id);
    return (m.before ? moveInOrder(ids, m.id, m.before, true) : moveInOrder(ids, m.id, m.after!, false)).flatMap((id) => byId.get(id) ?? []);
  });
  function endDrag() {
    if (dragged.current) dragged.current.style.opacity = "";
    dragged.current = null;
    setDragId(null);
    setOver(null);
    setLandAt(null);
  }

  async function moveTo(projectId: string, key: string) {
    if (batches.find((b) => b.ids.includes(projectId))?.key === key) return;
    setMoveError(null);
    setOptimistic({ base: projects, pins: { ...pins, ...pinsAfterMove(batches, billing, projectId, key) } });
    const res = await moveProjectToInvoice(projectId, key);
    if (res.error) {
      setOptimistic(null);
      setMoveError(res.error);
    }
  }
  // what a drop target needs: accept a dragged project, light up under it
  const dropTarget = (key: string) =>
    canMove
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== key) setOver(key);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragId) moveTo(dragId, key);
            setDragId(null);
            setOver(null);
          },
        }
      : {};
  // by invoice, unless a search is on
  const q = query.trim().toLowerCase();
  const filtering = status !== "all" || !!from || !!to;
  // a project's date is yyyy-mm-dd, so comparing the strings compares the days
  const matches = (p: ProjectCardData) =>
    (status === "all" || (status === "done") === (p.status === "completed")) &&
    (!from || p.date >= from) &&
    (!to || p.date <= to);
  const grouped = !q && (preset === "invoice" || preset === "invoice-all") && batches.length > 0;
  // what isn't finished yet belongs to no invoice, so it leads, on its own
  const unfinished = projects.filter((p) => !finished(p) && !batches.some((b) => b.ids.includes(p.id)));
  const allGroups = grouped
    ? [
        ...(unfinished.length
          ? [{ key: "unfinished", label: "Not finished yet", detail: `${unfinished.length} project${unfinished.length === 1 ? "" : "s"}`, items: unfinished, complete: false }]
          : []),
        ...batches.map((b) => {
          const items = projects.filter((p) => b.ids.includes(p.id));
          return { key: b.key, label: b.label, detail: b.detail, items, complete: b.complete };
        }),
      ]
    : [];
  // filtered, an invoice keeps only what matches, and goes if nothing does
  const groups = filtering ? allGroups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length) : allGroups;
  // the latest invoices, whole, until there are a few projects on show,
  // then "+N more" below them all (Abhishek, 21 Nov 2026: a card cut out of
  // an invoice read as part of it)
  let counted = 0;
  const firstGroups = groups.filter((g) => {
    if (counted >= LATEST) return false;
    counted += g.items.length;
    return true;
  });
  // 5 projects in all, the last invoice cut where they run out, the "+N
  // more" card after them (Abhishek, 21 Nov 2026); its heading still counts
  // every project in it (`total`). Filtered: every match, no "+N more".
  let room = LATEST;
  const collapsed = firstGroups.map((g) => {
    const take = Math.max(0, Math.min(room, g.items.length));
    room -= take;
    return take < g.items.length ? { ...g, items: g.items.slice(0, take), total: g.items.length } : g;
  });
  const collapsedIds = new Set(collapsed.flatMap((g) => g.items.map((p) => p.id)));
  const shownGroups = preset === "invoice" && !filtering ? collapsed : groups;
  // the list eases in when you change the view, not when the page arrives
  // (moving from one client to the next keeps everything still), nor when
  // it only grows
  const view = `${list}-${grouped}-${!!q}`;
  const [firstView] = useState(view);
  const shownIds = new Set(shownGroups.flatMap((g) => g.items.map((p) => p.id)));
  const hiddenItems = groups.flatMap((g) => g.items).filter((p) => !shownIds.has(p.id));
  const groupedHidden = hiddenItems.length;

  const visible =
    q || filtering
      ? ordered.filter((p) => (!q || p.name.toLowerCase().includes(q)) && matches(p))
      : preset === "latest"
        ? ordered.slice(0, LATEST)
        : ordered;
  const hiddenCount = q || filtering ? 0 : projects.length - visible.length;
  const fresh = new Set(
    grew ? (grouped ? groups.flatMap((g) => g.items).filter((p) => !collapsedIds.has(p.id)) : visible.slice(LATEST)).map((p) => p.id) : [],
  );
  // Everything moves (Abhishek, 21 Nov 2026: "should appear smoothly, not
  // instantly"): the "+N more" card fades, then the list grows, its height
  // easing (AutoHeight) and the new cards fading in; folding is the same
  // backwards, the cards going first
  const STEP = 160;
  const more = (to: View) => {
    if (phase) return;
    setPhase("growing");
    setTimeout(() => {
      setPhase(null);
      setFolded(false);
      setGrew(true);
      selectPreset(to);
    }, STEP);
  };
  // everything shown after "+N more": folds back to the first few (Abhishek,
  // 21 Nov 2026: "can't it be collapsible?"), the list's top back in view
  const top = useRef<HTMLDivElement>(null);
  const canFold = !q && !filtering && (grouped ? preset === "invoice-all" && groups.some((g) => g.items.some((p) => !collapsedIds.has(p.id))) : preset === "all" && projects.length > LATEST);
  // Folding is at once (Abhishek, 21 Nov 2026: fading everything first, then
  // scrolling, then folding left the "+N more" card coming far too late):
  // the list folds, and before it's painted the page is moved so the card
  // is in view, where the bottom of the long list was
  const folding = useRef(false);
  function fold() {
    if (phase) return;
    folding.current = true;
    setGrew(false);
    setFolded(true);
    selectPreset(preset === "invoice-all" ? "invoice" : "latest");
  }
  useLayoutEffect(() => {
    if (!folding.current) return;
    folding.current = false;
    const card = top.current?.querySelector<HTMLElement>("[data-more]");
    const r = card?.getBoundingClientRect();
    if (card && r && (r.top < 0 || r.bottom > window.innerHeight)) card.scrollIntoView({ block: "center" });
  }, [preset]);
  // a card's way in or out
  const motion = (id: string) => (fresh.has(id) ? "fade-in" : "");
  const moreMotion = phase === "growing" ? "fade-out" : folded ? "fade-in" : "";

  // the slot, unless dropping there would leave the project where it is
  const rest = visible.filter((p) => p.id !== dragId);
  const slotAt = dragId && landAt !== null && landAt !== visible.findIndex((p) => p.id === dragId) ? landAt : -1;
  useEaseAside(arrangeRef, `${slotAt} ${visible.map((p) => p.id).join()}`);
  const landing = (e: React.DragEvent) =>
    arrangeRef.current && dragId
      ? landingIndex(arrangeRef.current, [...arrangeRef.current.querySelectorAll<HTMLElement>(":scope > [data-project]")].filter((el) => el.dataset.project !== dragId), e.clientX, e.clientY, !list)
      : -1;
  // dropped at `at` among the others shown: just after the one before it
  // there, else just before the one after, with any filter's hidden
  // projects keeping their places (lib/projectOrder)
  function arrange(id: string, at: number) {
    const before = rest[at - 1]?.id ?? null;
    const after = rest[at]?.id ?? null;
    if (at < 0 || at === visible.findIndex((p) => p.id === id) || (!before && !after)) return;
    setMoveError(null);
    // a failed save ends its transition, which takes the move back off
    startTransition(async () => {
      applyArrange({ id, before, after });
      const res = await arrangeProject(clientId, id, before, after).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
      if (res.error) setMoveError(res.error);
    });
  }
  // on the grid, or the list's rows and the room around them
  const arrangeable = canMove && !grouped
    ? {
        // cards and rows are links, which the browser already lets you drag
        onDragStart: (e: React.DragEvent) => {
          const card = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-project]") : null;
          if (!card?.dataset.project) return;
          e.dataTransfer.effectAllowed = "move";
          // the card itself under the pointer, not the browser's picture of a link
          const r = card.getBoundingClientRect();
          e.dataTransfer.setDragImage(card, e.clientX - r.left, e.clientY - r.top);
          dragged.current = card;
          setDragHeight(card.offsetHeight);
          setDragId(card.dataset.project);
          // faded where it was, once the browser has its picture
          setTimeout(() => {
            if (dragged.current === card) card.style.opacity = "0.4";
          });
        },
        onDragOver: (e: React.DragEvent) => {
          if (!dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const at = landing(e);
          if (at !== landAt) setLandAt(at);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const id = dragId;
          const at = landing(e);
          endDrag();
          if (id) arrange(id, at);
        },
        // always fires, wherever it's let go (or Escape)
        onDragEnd: endDrag,
      }
    : {};

  function selectPreset(p: View) {
    setPreset(p === defaultView ? null : p);
    setParam("show", p === defaultView ? null : p);
  }

  return (
    <div ref={top} className="flex flex-col gap-4 scroll-mt-4">
      {/* the title on the left, the tools together on the right (Abhishek, 21
          Nov 2026: "not balanced"); on a phone the tools take their own line */}
      <div className="flex flex-wrap items-center gap-3">
        {/* with how many, as a project's Files heading has */}
        <h2 className="text-lg font-semibold tracking-tight">
          Projects <span className="ml-1 text-base font-normal text-muted tabular-nums">{projects.length}</span>
        </h2>
        {canSetGrouping && !projectBase && (
          <GroupingSetting clientId={clientId} cadence={billing.cadence} dayOfMonth={billing.dayOfMonth} milestoneCount={billing.every} />
        )}
        {/* a batch made by hand, from the projects picked for it (Abhishek,
            21 Nov 2026); months make themselves */}
        {canMove && billing.cadence !== "monthly_date" && nextKey?.startsWith("batch-") && (
          <NewBatch
            clientId={clientId}
            nextKey={nextKey}
            projects={projects.map((p) => ({ id: p.id, name: p.name, cover: p.coverUrl, batch: batches.find((b) => b.ids.includes(p.id))?.label ?? null }))}
          />
        )}
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {/* any project by its name, whichever view is on */}
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-muted transition-colors focus-within:border-hover focus-within:text-foreground sm:w-72 sm:flex-none">
            <Search size={13} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search projects"
              aria-label="Search projects"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none! placeholder:text-muted"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </label>
          <ProjectFilter
            status={status}
            onStatus={setStatus}
            from={from}
            to={to}
            today={today}
            onDates={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
          {/* the same height, edge and fill as the search and Filter beside it */}
          <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
            {(
              [
                [false, LayoutGrid, "Grid"],
                [true, List, "List"],
              ] as const
            ).map(([on, Icon, label]) => (
              <button
                key={label}
                onClick={() => {
                  setList(on);
                  setParam("layout", on ? "list" : null);
                }}
                aria-pressed={list === on}
                aria-label={label}
                title={label}
                className="seg flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs"
              >
                <Icon size={13} />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {moveError && <p className="text-xs text-red-300">{moveError}</p>}
      <AutoHeight>
      <div key={view} className={view !== firstView ? "fade-in" : undefined}>
      {grouped ? (
        <div className="flex flex-col gap-8">
          {filtering && groups.length === 0 && <p className="text-sm text-muted">No projects match these filters.</p>}
          {/* only while dragging: somewhere to start the next invoice. In the
              list only then, or its closed box still took a gap's room at
              the top (Abhishek, 21 Nov 2026: "so much space") */}
          {canMove && nextKey && dragId && (
            <Reveal open>
              <div
                {...dropTarget(nextKey)}
                className={`fade-in rounded-xl border px-4 py-3 text-center text-sm transition-colors duration-150 ${
                  over === nextKey ? "border-blue-400/60 bg-blue-400/[0.08] text-foreground" : "border-border/60 bg-surface/40 text-muted"
                }`}
              >
                Drop here for a new invoice
              </div>
            </Reveal>
          )}
          {/* each invoice a heading, then its projects as the grid always
              shows them (Abhishek, 21 Nov 2026: the folding rows read badly) */}
          {shownGroups.map((g, i) => (
            <section
              key={g.key}
              {...(g.key === "unfinished" ? {} : dropTarget(g.key))}
              // cards and rows are links, which the browser already lets you
              // drag; this just notes which project it is
              onDragStart={(e) => {
                const card = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-project]") : null;
                if (!canMove || g.key === "unfinished" || !card?.dataset.project) return;
                e.dataTransfer.effectAllowed = "move";
                // the card itself under the pointer, cover and all, not the
                // browser's picture of a link (Abhishek, 21 Nov 2026)
                const r = card.getBoundingClientRect();
                e.dataTransfer.setDragImage(card, e.clientX - r.left, e.clientY - r.top);
                dragged.current = card;
                setDragId(card.dataset.project);
                // faded where it was, once the browser has its picture
                setTimeout(() => {
                  if (dragged.current === card) card.style.opacity = "0.4";
                });
              }}
              onDragEnd={endDrag}
              className={`-mx-2 flex flex-col gap-3 rounded-xl p-2 transition-colors duration-150 ${over === g.key ? "bg-blue-400/[0.06] ring-1 ring-blue-400/50" : ""} ${
                firstGroups.includes(g) ? "" : grew ? "fade-in" : ""
              }`}
            >
              {/* The invoice's own line (Abhishek, 21 Nov 2026: "more modern"):
                  its name, its dates or how far along it is,
                  then a hairline running out to the edge */}
              <div className="group/inv flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* "Batch 6" or the month, or the name it was given, and only
                    the one; renamed where it reads (Abhishek, 21 Nov 2026) */}
                {canMove && g.key !== "unfinished" ? (
                  <EditableName
                    name={g.label}
                    pencil="always"
                    onSave={async (name) => (await renameInvoice(clientId, g.key, name)).error}
                    className="text-base font-semibold tracking-tight"
                  />
                ) : (
                  <span className="truncate text-base font-semibold tracking-tight">{g.label}</span>
                )}
                {(() => {
                  // an open invoice: how many of its projects are done, as a row of steps
                  const open = /^(\d+) of (\d+) done$/.exec(g.detail);
                  // one slim bar per project the invoice holds, the done ones
                  // filled (Abhishek, 21 Nov 2026), flat: no glow, no edge
                  return open ? (
                    <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
                      <span className="flex items-center gap-1" aria-hidden>
                        {Array.from({ length: Math.min(Number(open[2]), 20) }, (_, n) => (
                          <span key={n} className={`h-1 w-4 rounded-[2px] ${n < Number(open[1]) ? "bg-accent" : "bg-white/15"}`} />
                        ))}
                      </span>
                      {g.detail}
                    </span>
                  ) : (
                    // its dates and size, said once
                    <span className="truncate text-xs text-muted tabular-nums">
                      {g.detail}
                      {!/project|done/.test(g.detail) && (() => {
                        // every project in the invoice, not just those shown before "+N more"
                        const n = "total" in g && typeof g.total === "number" ? g.total : g.items.length;
                        return ` · ${n} project${n === 1 ? "" : "s"}`;
                      })()}
                    </span>
                  );
                })()}
                <span aria-hidden className="h-px min-w-8 flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
              </div>
              {list ? (
                <div className="flex flex-col gap-3">
                  {i === 0 && !projectBase && <AddProjectCard clientId={clientId} plan={plan} row />}
                  <ProjectRows projects={g.items} projectBase={projectBase} motion={motion} />
                  {i === shownGroups.length - 1 && groupedHidden > 0 && (
                    <button data-more onClick={() => more("invoice-all")} className={`self-start text-xs text-muted hover:text-foreground ${moreMotion}`}>
                      Show {groupedHidden} more
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {i === 0 && !projectBase && <AddProjectCard clientId={clientId} plan={plan} />}
                  {g.items.map((p) => (
                    <ProjectCard key={p.id} project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} readOnly={!!projectBase} className={motion(p.id)} />
                  ))}
                  {/* the older invoices, right after the last one shown (Abhishek, 21 Nov 2026) */}
                  {i === shownGroups.length - 1 && groupedHidden > 0 && (
                    <MoreProjectsCard count={groupedHidden} cover={hiddenItems[0]?.coverUrl ?? null} onClick={() => more("invoice-all")} className={moreMotion} />
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : list ? (
        <div {...arrangeable} className="flex flex-col gap-3">
          {!projectBase && <AddProjectCard clientId={clientId} plan={plan} row />}
          <ProjectRows ref={arrangeRef} projects={visible} projectBase={projectBase} slot={{ at: slotAt, height: dragHeight, dragId }} motion={motion} />
          {hiddenCount > 0 && (
            <button data-more onClick={() => more("all")} className={`self-start text-xs text-muted hover:text-foreground ${moreMotion}`}>
              Show {hiddenCount} more
            </button>
          )}
          {(q || filtering) && visible.length === 0 && <p className="text-sm text-muted">{q ? <>No projects match &ldquo;{query.trim()}&rdquo;.</> : "No projects match these filters."}</p>}
        </div>
      ) : (
        <div
          ref={(el) => {
            arrangeRef.current = el;
          }}
          {...arrangeable}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4"
        >
          {!projectBase && <AddProjectCard clientId={clientId} plan={plan} />}
          {visible.map((p) => (
            <Fragment key={p.id}>
              {slotAt >= 0 && rest[slotAt]?.id === p.id && <DropSlot height={dragHeight} />}
              <ProjectCard project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} readOnly={!!projectBase} className={motion(p.id)} />
            </Fragment>
          ))}
          {slotAt >= 0 && slotAt >= rest.length && <DropSlot height={dragHeight} />}
          {hiddenCount > 0 && (
            <MoreProjectsCard
              count={hiddenCount}
              cover={ordered[visible.length]?.coverUrl ?? null}
              onClick={() => more("all")}
              className={moreMotion}
            />
          )}
          {(q || filtering) && visible.length === 0 && (
            <p className="col-span-full text-sm text-muted">{q ? <>No projects match &ldquo;{query.trim()}&rdquo;.</> : "No projects match these filters."}</p>
          )}
        </div>
      )}
      </div>
      </AutoHeight>
      {canFold && (
        <button
          type="button"
          onClick={fold}
          className="fade-in flex items-center gap-1 self-center text-xs text-muted transition-colors hover:text-foreground"
        >
          <ChevronUp size={12} /> Show less
        </button>
      )}
    </div>
  );
}

// A new batch, from the projects ticked for it: each moved there as a drag
// onto it would (moveProjectToInvoice), then given its name if one's typed
function NewBatch({ clientId, nextKey, projects }: { clientId: string; nextKey: string; projects: { id: string; name: string; cover: string | null; batch: string | null }[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const number = nextKey.replace("batch-", "");
  const toggle = (id: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  async function create() {
    if (!picked.size || busy) return;
    setBusy(true);
    setError(null);
    for (const id of picked) {
      const res = await moveProjectToInvoice(id, nextKey).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
      if (res.error) {
        setBusy(false);
        return setError(res.error);
      }
    }
    if (name.trim()) await renameInvoice(clientId, nextKey, name.trim()).catch(() => null);
    setBusy(false);
    dialog.current?.close();
    router.refresh();
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setPicked(new Set());
          setName("");
          setError(null);
          dialog.current?.showModal();
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-muted transition-colors hover:border-hover hover:text-foreground"
      >
        <Plus size={13} /> New batch
      </button>
      <dialog
        ref={dialog}
        {...closeOnBackdrop}
        aria-label="New batch"
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[min(40rem,calc(100vh-4rem))] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-0 text-foreground"
      >
        <div className="pop-in flex max-h-[min(40rem,calc(100vh-4rem))] flex-col">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
              <Layers size={15} />
            </span>
            <h2 className="text-base font-semibold tracking-tight">New batch</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="ml-auto rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 pt-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Batch ${number}`}
              aria-label="Batch name"
              className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground outline-none! transition-colors placeholder:text-muted focus:border-hover"
            />
            <p className="mt-3 text-xs text-muted">Projects in it</p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {projects.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]">
                  <Checkbox checked={picked.has(p.id)} onChange={(on) => toggle(p.id, on)} label={p.name} />
                  <span className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
                    {p.cover && (
                      // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
                      <img src={p.cover} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  {p.batch && <span className="shrink-0 text-xs text-muted">{p.batch}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
            {error && <p className="mr-auto text-xs text-red-300">{error}</p>}
            <button type="button" onClick={() => dialog.current?.close()} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={create} disabled={!picked.size || busy} className="btn btn-sm btn-glow disabled:opacity-50">
              {busy ? "Creating…" : picked.size ? `Create with ${picked.size} project${picked.size === 1 ? "" : "s"}` : "Create batch"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

// What the projects can be narrowed to, in one small menu: where each one
// is, and (once anything's been marked) whether it's paid for
const STATUS_OPTIONS = [
  ["all", "All"],
  ["progress", "In progress"],
  ["done", "Delivered"],
] as const;
const RECENT = [
  [1, "Last month"],
  [3, "Last 3 months"],
  [6, "Last 6 months"],
] as const;
// the same day n months back, as yyyy-mm-dd (31 Mar less a month is 3 Mar,
// as the calendar rolls; near enough for a filter)
function monthsBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - n, d)).toISOString().slice(0, 10);
}
function ProjectFilter({
  status,
  onStatus,
  from,
  to,
  today,
  onDates,
}: {
  status: "all" | "progress" | "done";
  onStatus: (v: "all" | "progress" | "done") => void;
  from: string;
  to: string;
  // yyyy-mm-dd, the studio's day, for "Last 3 months"
  today: string;
  onDates: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(250);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);
  useEffect(() => {
    const out = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);
  const count = Number(status !== "all") + Number(!!(from || to));
  const group = <V extends string>(title: string, options: readonly (readonly [V, string])[], value: V, onPick: (v: V) => void) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, label]) => (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={value === v} className="chip rounded-full px-2.5 py-1 text-xs">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) place(trigger.current, { width: 288, align: "end" });
          setOpen((v) => !v);
        }}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
          count ? "border-hover bg-hover text-foreground" : "border-border bg-surface-2 text-muted hover:text-foreground"
        }`}
      >
        <Filter size={13} />
        <span className="hidden sm:inline">Filter</span>
        {count > 0 && <span className="rounded-full bg-accent/20 px-1.5 text-[10px] font-medium text-accent tabular-nums">{count}</span>}
      </button>
      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 flex flex-col gap-3 rounded-xl popover p-3 shadow-lg"
        >
          {group("Status", STATUS_OPTIONS, status, onStatus)}
          {/* from when to when: finished then, or made then if still going */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-muted">Date</p>
            {/* the usual spans in one tap (Abhishek, 21 Nov 2026), or any two days below */}
            <div className="flex flex-wrap gap-1.5">
              {RECENT.map(([n, label]) => {
                const since = monthsBefore(today, n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => (from === since && !to ? onDates("", "") : onDates(since, ""))}
                    aria-pressed={from === since && !to}
                    className="chip rounded-full px-2.5 py-1 text-xs"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker size="sm" value={from} onChange={(v) => onDates(v, to)} placeholder="From" />
              <DatePicker size="sm" value={to} onChange={(v) => onDates(from, v)} placeholder="To" />
            </div>
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={() => {
                onStatus("all");
                onDates("", "");
              }}
              className="self-start text-xs text-muted hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The list's height eases open when it grows (more shown, a search
// widening), rather than jumping. Clipped only while it moves, so a
// card's shadow or a menu is never cut off otherwise.
function AutoHeight({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = i.offsetHeight;
    const watch = new ResizeObserver(() => {
      const next = i.offsetHeight;
      // easing a shrink fought the page's own scroll; a fold is at once
      if (next < last || next - last < 2) {
        last = next;
        return;
      }
      o.style.overflow = "hidden";
      const move = o.animate([{ height: `${last}px` }, { height: `${next}px` }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      move.onfinish = move.oncancel = () => (o.style.overflow = "");
      last = next;
    });
    watch.observe(i);
    return () => watch.disconnect();
  }, []);
  // no scroll anchoring: the browser nudging the page while the height eases is a shake
  return (
    <div ref={outer} style={{ overflowAnchor: "none" }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

// `slot`: where a project being dragged will land (at -1: nowhere). Rows
// that ease aside are transformed, so the rounded list isolates them (WebKit).
function ProjectRows({
  ref,
  projects,
  projectBase,
  slot,
  motion,
}: {
  ref?: React.RefObject<HTMLElement | null>;
  projects: ProjectCardData[];
  projectBase?: string;
  slot?: { at: number; height: number; dragId: string | null };
  // a row's way in ("fade-in" or "")
  motion?: (id: string) => string;
}) {
  if (projects.length === 0) return null;
  const rest = projects.filter((p) => p.id !== slot?.dragId);
  const at = slot?.at ?? -1;
  return (
    <ul
      ref={(el) => {
        if (ref) ref.current = el;
      }}
      className="relative isolate flex flex-col divide-y divide-border overflow-hidden panel-soft rounded-xl"
    >
      {projects.map((p) => (
        <Fragment key={p.id}>
          {at >= 0 && rest[at]?.id === p.id && <DropSlot height={slot!.height} row />}
          <ProjectRow project={p} href={projectBase ? `${projectBase}/${p.id}` : undefined} className={motion?.(p.id) || undefined} />
        </Fragment>
      ))}
      {at >= 0 && at >= rest.length && <DropSlot height={slot!.height} row />}
    </ul>
  );
}

// A peek of the projects still hidden, stacked behind the front face like a
// deck of cards, instead of a plain text link below the grid. The front
// face reuses one of the actual hidden covers (grayscale + faded) so it
// reads as "more of this", not a generic placeholder.
function MoreProjectsCard({ count, cover, onClick, className = "" }: { count: number; cover: string | null; onClick: () => void; className?: string }) {
  return (
    <button data-more onClick={onClick} className={`group block w-full text-left ${className}`}>
      {/* The two layers behind trace the card's own box exactly: `inset-0`
          on a wrapper that is only as tall as the card, offset by an even
          6px then 12px. They used to be sized off the grid cell, which
          stretches to the tallest card in the row — so on a shorter card
          they hung past its bottom edge by different amounts, which is what
          read as an uneven stack. */}
      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-3 -translate-y-3 rounded-xl border border-border/40 bg-surface-2/25"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-xl border border-border/60 bg-surface-2/45"
        />
      <div className="card-surface card-interactive relative flex flex-col overflow-hidden rounded-xl shadow-sm">
        <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover opacity-40 grayscale transition-opacity group-hover:opacity-55"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="text-sm font-medium text-white">More projects</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <p className="text-[13px] font-medium text-muted">+{count} more</p>
        </div>
      </div>
      </span>
    </button>
  );
}
