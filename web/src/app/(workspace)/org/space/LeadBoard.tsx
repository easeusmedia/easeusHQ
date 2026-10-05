"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftToLine, ArrowRight, ArrowRightToLine, EyeOff, MoreHorizontal, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { dayOf, moveNeedsReason, phaseKey, toneOf, type BoardData, type LeadData, type StageData, tracksOutreach } from "@/lib/space";
import { sortBetween } from "@/lib/reorder";
import { createStage, deleteStage, moveLead, orderStages, renameStage, reorderLead } from "./actions";
import { ReasonDialog } from "./ReasonDialog";
import { LeadCard, type Outreach } from "./LeadCard";
import { NewLead } from "./NewLead";
import { EditableName } from "../../EditableName";
import { scrollPageNearEdge } from "../../StickyColumns";
import { topLayer, useCloseOnScroll, usePopover } from "../../popover";

const OFFLINE = "That couldn't be saved. Check your connection and try again.";
const COLUMN = "w-[15rem] shrink-0";
export const MENU_ITEM = "menu-item px-2.5 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-40";
const QUIET_ROW = "flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground";

const without = <T,>(map: Record<string, T>, id: string) => Object.fromEntries(Object.entries(map).filter(([k]) => k !== id));

// Where in a column a card dropped at `y` lands: before the first other
// card whose middle is below the pointer, or at the end
function indexAt(column: HTMLElement, y: number, dragId: string) {
  const cards = [...column.querySelectorAll<HTMLElement>("[data-lead-id]")].filter((el) => el.dataset.leadId !== dragId);
  const i = cards.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return i < 0 ? cards.length : i;
}

// A "⋯" button and its menu, drawn in the top layer so no column or
// scroller can crop it. The menu gets `close` to call after a pick.
export function MoreMenu({
  label,
  width = 224,
  height = 240,
  children,
}: {
  label: string;
  width?: number;
  height?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(height);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) return setOpen(false);
          place(trigger.current, { width, align: "end" });
          setOpen(true);
        }}
        className={`grid size-7 place-items-center rounded-lg transition-colors hover:bg-foreground/[0.06] hover:text-foreground ${open ? "bg-foreground/[0.06] text-foreground" : "text-muted"}`}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && position && (
        <div
          {...topLayer}
          role="menu"
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 rounded-xl popover p-1 shadow-lg"
        >
          {children(close)}
        </div>
      )}
    </span>
  );
}

// A field that adds something on Enter and goes away on Escape (or when
// left empty). It stays up showing the error if the save fails.
function InlineInput({
  placeholder,
  className,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  className: string;
  onSubmit: (value: string) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const v = value.trim();
    if (!v) return onCancel();
    setBusy(true);
    setError(null);
    const err = await onSubmit(v);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className={`fade-in ${className}`}>
      <input
        autoFocus
        value={value}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value.trim() && !busy && onCancel()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full bg-transparent text-sm text-foreground outline-none! placeholder:text-muted/60 disabled:opacity-60"
      />
      {busy && <p className="fade-in mt-1 text-[11px] text-muted">Adding…</p>}
      {error && (
        <p role="alert" className="fade-in mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

// What the board shows ahead of the server: moves, reorders, stage colours,
// names and order. A refresh brings a new `board`, and with it the
// server's word, so these are dropped then.
type Local = {
  for: BoardData;
  moved: Record<string, { stageId: string; sortOrder: number }>;
  order: string[] | null;
  patch: Record<string, Partial<StageData>>;
};
const fresh = (board: BoardData): Local => ({ for: board, moved: {}, order: null, patch: {} });

// The board, Notion-style: a column per stage in a row that scrolls
// sideways. Cards drag between and within columns (one step forward is
// free; anything else asks why), each column adds a lead at its foot, and
// stages are renamed, recoloured and (for builders) added, moved and
// deleted from their headers.
export function LeadBoard({
  board,
  leads,
  canBuild,
  hideEmpty,
  onShowEmpty,
  onOpen,
  onTrack,
}: {
  board: BoardData;
  // the board's leads after the search and filters
  leads: LeadData[];
  canBuild: boolean;
  hideEmpty: boolean;
  onShowEmpty: () => void;
  onOpen: (id: string) => void;
  // a lead's opens or reply, tapped on its card
  onTrack?: (id: string, change: Outreach) => void;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(() => fresh(board));
  const live = local.for === board ? local : fresh(board);
  const update = (fn: (l: Local) => Partial<Local>) =>
    setLocal((prev) => {
      const l = prev.for === board ? prev : fresh(board);
      return { ...l, ...fn(l) };
    });

  const [drag, setDrag] = useState<string | null>(null);
  // a stage being dragged to a new place, and the column it's over
  const [dragStage, setDragStage] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  // the dragged card's height, for the slot that shows where it will land
  const [dragHeight, setDragHeight] = useState(0);
  const [over, setOver] = useState<{ stageId: string; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newStageAt, setNewStageAt] = useState<number | null>(null);
  // held after closing too, so the dialogs keep their words while they fade
  const [asking, setAsking] = useState<{ open: boolean; lead: LeadData; from: StageData; to: StageData; sortOrder: number } | null>(null);
  const [removing, setRemoving] = useState<{ open: boolean; stage: StageData } | null>(null);

  const byId = new Map(board.stages.map((s) => [s.id, s]));
  const stages: StageData[] = (live.order ?? board.stages.map((s) => s.id)).flatMap((id) => {
    const s = byId.get(id);
    return s ? [{ ...s, ...live.patch[id] }] : [];
  });
  const order = stages.map((s) => s.id);
  const shown = leads.map((l) => (live.moved[l.id] ? { ...l, ...live.moved[l.id] } : l));
  // the day (or stage) a lead is on, for the reply it gets there
  const dayOfStage = (stageId: string) => {
    const st = board.stages.find((s) => s.id === stageId);
    if (!st) return undefined;
    const d = dayOf(st.name);
    return { key: phaseKey(st), name: d == null ? st.name : `Day ${d}` };
  };
  const columnOf = (stageId: string) => shown.filter((l) => l.stageId === stageId).sort((a, b) => a.sortOrder - b.sortOrder);

  // ---- leads ----
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  async function move(id: string, stageId: string, sortOrder: number, reason?: string) {
    update((l) => ({ moved: { ...l.moved, [id]: { stageId, sortOrder } } }));
    const res = await moveLead(id, stageId, sortOrder, reason).catch(() => ({ error: OFFLINE, needsReason: false }));
    if (res.error) update((l) => ({ moved: without(l.moved, id) }));
    else router.refresh();
    return res;
  }

  // within a column: nothing else on the page changes, so no refresh
  async function reorder(lead: LeadData, sortOrder: number) {
    update((l) => ({ moved: { ...l.moved, [lead.id]: { stageId: lead.stageId, sortOrder } } }));
    const res = await reorderLead(lead.id, sortOrder).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      update((l) => ({ moved: without(l.moved, lead.id) }));
      setError(res.error);
    }
  }

  function drop(stage: StageData, e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    const id = drag;
    endDrag();
    const lead = shown.find((l) => l.id === id);
    if (!id || !lead) return;
    const col = columnOf(stage.id);
    const rest = col.filter((l) => l.id !== id);
    const index = indexAt(e.currentTarget, e.clientY, id);
    const sortOrder = sortBetween(rest[index - 1]?.sortOrder, rest[index]?.sortOrder);
    if (lead.stageId === stage.id) {
      if (col[index]?.id !== id) reorder(lead, sortOrder);
      return;
    }
    const from = stages.find((s) => s.id === lead.stageId);
    if (from && moveNeedsReason(order, lead.stageId, stage.id)) return setAsking({ open: true, lead, from, to: stage, sortOrder });
    move(id, stage.id, sortOrder).then((res) => {
      // the stages changed under us and this now skips one: ask after all
      if (res.needsReason && from) setAsking({ open: true, lead, from, to: stage, sortOrder });
      else if (res.error) setError(res.error);
    });
  }

  // ---- stages ----
  // a stage's new place: the whole order, saved in one go
  async function renumber(ids: string[]) {
    update(() => ({ order: ids }));
    const res = await orderStages(board.id, ids).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      update(() => ({ order: null }));
      setError(res.error);
      return;
    }
    router.refresh();
  }

  function shiftStage(id: string, by: 1 | -1) {
    const ids = [...order];
    const i = ids.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    renumber(ids);
  }

  async function addStage(name: string, at: number) {
    const res = await createStage(board.id, name, undefined, at > 0 ? order[at - 1] : null).catch(() => ({ error: OFFLINE, stage: undefined }));
    if (res.error || !res.stage) return res.error ?? OFFLINE;
    setNewStageAt(null);
    // a stage can only be added after another, so a new first one is moved to the front
    if (at === 0 && order.length) await renumber([res.stage.id, ...order]);
    else router.refresh();
  }

  async function patchStage(id: string, change: Partial<StageData>, save: () => Promise<{ error?: string }>) {
    update((l) => ({ patch: { ...l.patch, [id]: { ...l.patch[id], ...change } } }));
    const res = await save().catch(() => ({ error: OFFLINE }));
    if (res.error) {
      update((l) => ({ patch: without(l.patch, id) }));
      return res.error;
    }
    router.refresh();
  }

  function stageMenu(stage: StageData, i: number, close: () => void) {
    return (
      <>
        {canBuild && (
          <>
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => {
                close();
                setNewStageAt(i);
              }}
            >
              <ArrowLeftToLine size={14} className="text-muted" /> Insert stage left
            </button>
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => {
                close();
                setNewStageAt(i + 1);
              }}
            >
              <ArrowRightToLine size={14} className="text-muted" /> Insert stage right
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={i === 0}
              className={MENU_ITEM}
              onClick={() => {
                close();
                shiftStage(stage.id, -1);
              }}
            >
              <ArrowLeft size={14} className="text-muted" /> Move left
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={i === stages.length - 1}
              className={MENU_ITEM}
              onClick={() => {
                close();
                shiftStage(stage.id, 1);
              }}
            >
              <ArrowRight size={14} className="text-muted" /> Move right
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM} text-red-300! hover:text-red-200!`}
              onClick={() => {
                close();
                setRemoving({ open: true, stage });
              }}
            >
              <Trash2 size={14} /> Delete stage
            </button>
          </>
        )}
      </>
    );
  }

  // a stage dropped on another takes its place
  function dropStage(target: StageData) {
    const id = dragStage;
    setDragStage(null);
    setOverStage(null);
    if (!id || id === target.id) return;
    const from = order.indexOf(id);
    const to = order.indexOf(target.id);
    const ids = order.filter((x) => x !== id);
    ids.splice(ids.indexOf(target.id) + (to > from ? 1 : 0), 0, id);
    renumber(ids);
  }
  // a stage being dragged can land on another's header or its cards
  const stageDrop = (stage: StageData) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragStage) return;
      e.preventDefault();
      if (overStage !== stage.id) setOverStage(stage.id);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragStage) return;
      e.preventDefault();
      e.stopPropagation();
      dropStage(stage);
    },
  });

  // The stage's header: a quiet pill with its name and count. Level 1 and 2
  // drag it to move the stage, and get its menu.
  function header(stage: StageData, i: number, count: number) {
    const tone = toneOf(stage.color);
    const target = !!dragStage && overStage === stage.id && dragStage !== stage.id;
    return (
      <div
        {...stageDrop(stage)}
        draggable={canBuild}
        onDragStart={(e) => {
          if (!canBuild) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", stage.id);
          setDragStage(stage.id);
        }}
        onDragEnd={() => {
          setDragStage(null);
          setOverStage(null);
        }}
        title={canBuild ? "Drag to move this stage" : stage.name}
        className={`mist-tint flex h-8 min-w-0 items-center gap-2 rounded-full border pr-1 pl-2.5 text-xs font-medium transition-[opacity,box-shadow] ${tone.pill} ${canBuild ? "cursor-grab active:cursor-grabbing" : ""} ${
          target ? "ring-2 ring-accent/60" : ""
        } ${dragStage === stage.id ? "opacity-40" : ""}`}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span className="flex min-w-0 flex-1" title={stage.name}>
          <EditableName name={stage.name} pencil="hover" onSave={(name) => patchStage(stage.id, { name }, () => renameStage(stage.id, name))} />
        </span>
        <span className="shrink-0 px-1 text-muted tabular-nums">{count}</span>
        {canBuild && (
          <MoreMenu label={`${stage.name} options`} height={220}>
            {(close) => stageMenu(stage, i, close)}
          </MoreMenu>
        )}
      </div>
    );
  }

  // A stage's cards: drop a card in, drag one out; the first stage adds leads.
  // While a card is dragged, only a slot of its size shows where it will land.
  function body(stage: StageData, i: number, col: LeadData[]) {
    const isOver = !!drag && over?.stageId === stage.id;
    const rest = col.filter((l) => l.id !== drag);
    // the slot, unless dropping there would leave the card where it is
    const from = col.findIndex((l) => l.id === drag);
    const slotAt = isOver && over.index !== from ? over.index : -1;
    const slot = <div key="slot" style={{ height: dragHeight || 56 }} className="shrink-0 rounded-xl border border-dashed border-white/15 bg-white/[0.03]" />;
    return (
      <section
        aria-label={stage.name}
        onDragOver={(e) => {
          if (dragStage) return stageDrop(stage).onDragOver(e);
          if (!drag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const index = indexAt(e.currentTarget, e.clientY, drag);
          if (!isOver || over.index !== index) setOver({ stageId: stage.id, index });
        }}
        onDrop={(e) => (dragStage ? stageDrop(stage).onDrop(e) : drop(stage, e))}
        className="flex min-h-[60vh] min-w-0 flex-col gap-2"
      >
        {/* every lead starts here, at the first stage */}
        {i === 0 && <NewLead boardId={board.id} onCreated={onOpen} />}
        {col.map((lead) => (
          <Fragment key={lead.id}>
            {slotAt >= 0 && rest[slotAt]?.id === lead.id && slot}
            <div
              data-lead-id={lead.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", lead.id);
                setDragHeight(e.currentTarget.offsetHeight);
                setDrag(lead.id);
              }}
              // always fires, wherever the drop lands (or Escape), so a
              // card is never left faded
              onDragEnd={endDrag}
              className={drag === lead.id ? "opacity-35" : ""}
            >
              <LeadCard lead={lead} fields={board.fields} onOpen={onOpen} tracks={tracksOutreach(board.stages, lead)} day={dayOfStage(lead.stageId)} onTrack={onTrack} />
            </div>
          </Fragment>
        ))}
        {slotAt >= 0 && slotAt >= rest.length && slot}
      </section>
    );
  }

  const counts = new Map(stages.map((s) => [s.id, columnOf(s.id)]));
  const hidden = hideEmpty ? stages.filter((s, i) => i > 0 && !counts.get(s.id)?.length).length : 0;
  const stageInput = (at: number) => (
    <div key={`new-${at}`} className={`${COLUMN}`}>
      <InlineInput placeholder="Stage name, then Enter" className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs" onSubmit={(name) => addStage(name, at)} onCancel={() => setNewStageAt(null)} />
    </div>
  );

  return (
    <>
      {/* one row of stages that scrolls sideways (a trackpad, or Shift and the wheel) */}
      <div className="relative">
        <div
          onDragOver={(e) => {
            if (!drag && !dragStage) return;
            // follow a dragged card to a stage off to the side, or down the page
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientX < r.left + 80) e.currentTarget.scrollLeft -= 18;
            else if (e.clientX > r.right - 80) e.currentTarget.scrollLeft += 18;
            scrollPageNearEdge(e);
          }}
          // runs out to the page's own edges (its padding taken back), so
          // stages scrolled sideways fade out softly in the margin rather
          // than being cut off in mid air; the room above keeps a card's
          // focus ring and hover lift whole. (Menus open in the top layer,
          // so the fade never touches them.)
          className="-mx-(--page-pad) -mt-1.5 overflow-x-auto px-(--page-pad) pt-1.5 pb-4 [mask-image:linear-gradient(to_right,transparent,#000_var(--page-pad),#000_calc(100%_-_var(--page-pad)),transparent)]"
        >
          <div className="flex w-max items-start gap-3">
            {stages.map((stage, i) => {
              const col = counts.get(stage.id) ?? [];
              const shownHere = !(hideEmpty && i > 0 && !col.length);
              return (
                <Fragment key={stage.id}>
                  {newStageAt === i && stageInput(i)}
                  {shownHere && (
                    <div className={`${COLUMN} flex flex-col gap-2`}>
                      {header(stage, i, col.length)}
                      {body(stage, i, col)}
                    </div>
                  )}
                </Fragment>
              );
            })}
            {newStageAt === stages.length && stageInput(stages.length)}
            {(canBuild || hidden > 0) && newStageAt === null && (
              <div className="flex w-44 shrink-0 flex-col gap-2">
                {canBuild && (
                  <button type="button" onClick={() => setNewStageAt(stages.length)} className={QUIET_ROW}>
                    <Plus size={14} /> Add a stage
                  </button>
                )}
                {hidden > 0 && (
                  <button type="button" onClick={onShowEmpty} className="flex items-center gap-1.5 px-2 text-left text-xs text-muted transition-colors hover:text-foreground">
                    <EyeOff size={13} className="shrink-0" /> {hidden} empty {hidden === 1 ? "stage" : "stages"} hidden · <span className="text-accent">Show</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ReasonDialog
        open={!!asking?.open}
        title={asking ? `Move ${asking.lead.title} from ${asking.from.name} to ${asking.to.name}?` : ""}
        hint="It's skipping a stage or going back, so say why. It stays on the lead's record."
        confirm="Move"
        onCancel={() => setAsking((a) => a && { ...a, open: false })}
        onConfirm={async (reason) => {
          if (!asking) return;
          const res = await move(asking.lead.id, asking.to.id, asking.sortOrder, reason);
          if (res.error) return res.error;
          setAsking((a) => a && { ...a, open: false });
        }}
      />

      <ReasonDialog
        open={!!removing?.open}
        danger
        title={removing ? `Delete the ${removing.stage.name} stage?` : ""}
        hint="Only an empty stage can be deleted. It goes to the bin with your reason."
        confirm="Delete stage"
        onCancel={() => setRemoving((r) => r && { ...r, open: false })}
        onConfirm={async (reason) => {
          if (!removing) return;
          const res = await deleteStage(removing.stage.id, reason).catch(() => ({ error: OFFLINE }));
          if (res.error) return res.error;
          setRemoving((r) => r && { ...r, open: false });
          router.refresh();
        }}
      />

      {error && (
        <div onClick={() => setError(null)} className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div role="alertdialog" aria-label="Couldn't save" onClick={(e) => e.stopPropagation()} className="glass pop-in flex max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-red-400/15">
              <ShieldAlert size={22} className="text-red-300" />
            </div>
            <p className="text-sm text-foreground">{error}</p>
            <button type="button" autoFocus onClick={() => setError(null)} className="btn btn-sm btn-glow">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
