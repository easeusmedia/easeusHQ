"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Contact,
  Hash,
  Link2,
  SlidersHorizontal,
  SquareCheck,
  Tag,
  Tags,
  TextAlignStart,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { FIELD_KINDS, type BoardData, type FieldData, type FieldKind } from "@/lib/space";
import { createField, deleteField, renameField, reorderField, setFieldFlags } from "./actions";
import { ReasonDialog } from "./ReasonDialog";
import { EditableName } from "../../EditableName";
import { PlusBadge } from "../../AddButton";
import { closeOnBackdrop } from "../../dialog";
import { topLayer, useCloseOnScroll, usePopover } from "../../popover";

// One glyph per kind of property, wherever a property is listed
export const FIELD_ICONS: Record<FieldKind, LucideIcon> = {
  select: Tag,
  multi: Tags,
  count: Hash,
  contacts: Contact,
  links: Link2,
  checkbox: SquareCheck,
  date: CalendarDays,
  text: TextAlignStart,
};
const kindLabel = (k: FieldKind) => FIELD_KINDS.find((f) => f.kind === k)?.label ?? k;

const OFFLINE = "That couldn't be saved. Check your connection and try again.";
// row controls that wait for the pointer, where there is one (a touch
// screen has no hover, so there they always show)
const QUIET = "transition-[opacity,color,background-color] pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100";

// The properties every lead on a board records, for the department's Level 1
// and Level 2: add, rename, reorder, choose what shows on cards and which
// are basic details, and delete (with a reason, kept in the bin).
export function BoardProperties({ open, board, onClose }: { open: boolean; board: BoardData; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState(board.fields);
  // a refresh brings the saved list; it replaces what's shown here
  const [seen, setSeen] = useState(board.fields);
  if (seen !== board.fields) {
    setSeen(board.fields);
    setFields(board.fields);
  }
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FieldKind>("select");
  const [adding, setAdding] = useState(false);
  // the property being deleted (kept while the reason dialog fades out)
  const [doomed, setDoomed] = useState<FieldData | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // Writes go one at a time, in order, and the page refreshes once they're
  // all done: a refresh between two of them would put back an order that's
  // already been changed on screen.
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function save<T extends { error?: string }>(write: () => Promise<T>): Promise<T | { error: string }> {
    pending.current++;
    const done = queue.current.then(() => write()).catch(() => ({ error: OFFLINE }));
    queue.current = done;
    return done.finally(() => {
      if (--pending.current === 0) router.refresh();
    });
  }

  // The number each property is saved at, as far as this dialog has set it.
  // A board's properties come without their numbers, so the first move
  // numbers them all 1, 2, 3…; after that only the ones that moved.
  const placed = useRef(new Map<string, number>());
  function move(from: number, to: number) {
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setFields(next);
    setError(null);
    const ids = next.map((f) => f.id);
    save(async () => {
      for (const [i, id] of ids.entries()) {
        if (placed.current.get(id) === i + 1) continue;
        const res = await reorderField(id, i + 1);
        if (res.error) {
          placed.current.clear();
          return res;
        }
        placed.current.set(id, i + 1);
      }
      return {};
    }).then((res) => res.error && setError(res.error));
  }

  function flag(f: FieldData, key: "onCard" | "required") {
    const on = !f[key];
    setFields((list) => list.map((x) => (x.id === f.id ? { ...x, [key]: on } : x)));
    setError(null);
    save(() => setFieldFlags(f.id, { [key]: on })).then((res) => res.error && setError(res.error));
  }

  async function add() {
    const n = name.trim();
    if (!n || adding) return;
    setAdding(true);
    setError(null);
    const res = await save(() => createField(board.id, n, kind));
    setAdding(false);
    if (res.error) return setError(res.error);
    const made = "field" in res ? res.field : undefined;
    if (made) setFields((list) => [...list, made]);
    setName("");
  }

  return (
    <>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        onClose={() => {
          setError(null);
          if (open) onClose();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <div className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <SlidersHorizontal size={16} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-sm font-medium">Properties</h2>
              <p className="mt-0.5 text-xs text-muted">
                What every lead on {board.name} records. Basic details are the ones a card flags when missing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {fields.length > 0 ? (
            <>
              {/* column names, lined up with the switches below */}
              <div className="flex items-end gap-2 px-5 pb-1.5 text-[11px] leading-tight font-medium text-muted/70">
                <span className="min-w-0 flex-1 pl-7 sm:pl-16">Property</span>
                <span className="w-16 shrink-0 text-center">On cards</span>
                <span className="w-16 shrink-0 text-center">Basic detail</span>
                <span className="w-7 shrink-0" />
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                {fields.map((f, i) => {
                  const Icon = FIELD_ICONS[f.kind];
                  return (
                    <li key={f.id} className="group/row fade-in flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
                      <span className={`flex w-5 shrink-0 flex-col items-center ${QUIET}`}>
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => move(i, i - 1)}
                          aria-label={`Move ${f.name} up`}
                          className="flex h-4 w-5 items-center justify-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={i === fields.length - 1}
                          onClick={() => move(i, i + 1)}
                          aria-label={`Move ${f.name} down`}
                          className="flex h-4 w-5 items-center justify-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown size={13} />
                        </button>
                      </span>
                      <span title={kindLabel(f.kind)} className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted max-sm:hidden">
                        <Icon size={14} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <EditableName
                          name={f.name}
                          pencil="hover"
                          className="text-sm font-medium"
                          onSave={async (next) => {
                            const res = await save(() => renameField(f.id, next));
                            if (!res.error) setFields((list) => list.map((x) => (x.id === f.id ? { ...x, name: next } : x)));
                            return res.error;
                          }}
                        />
                        <span className="text-[11px] text-muted">{kindLabel(f.kind)}</span>
                      </div>
                      <span className="flex w-16 shrink-0 justify-center">
                        <Switch on={f.onCard} label={`Show ${f.name} on cards`} onToggle={() => flag(f, "onCard")} />
                      </span>
                      <span className="flex w-16 shrink-0 justify-center">
                        <Switch on={f.required} label={`${f.name} is a basic detail`} onToggle={() => flag(f, "required")} />
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDoomed(f);
                          setAsking(true);
                        }}
                        aria-label={`Delete ${f.name}`}
                        title="Delete"
                        className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-400/10 hover:text-rose-300 ${QUIET}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No properties yet. Add the first one below.</p>
          )}

          {error && (
            <p role="alert" className="fade-in px-5 pb-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* a new property: its name and kind */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex flex-wrap items-center gap-2 border-t border-border/50 px-5 py-4"
          >
            <label className="flex min-w-48 flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-colors focus-within:border-hover">
              <PlusBadge />
              <input
                value={name}
                disabled={adding}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add a property"
                aria-label="New property name"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none! placeholder:text-muted disabled:opacity-60"
              />
            </label>
            <KindPicker value={kind} onPick={setKind} />
            <button type="submit" disabled={!name.trim() || adding} className="btn btn-sm btn-glow disabled:opacity-50">
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      </dialog>

      <ReasonDialog
        open={asking}
        danger
        title={`Delete "${doomed?.name ?? ""}"?`}
        hint="Its value comes off every lead on this board. The bin keeps a record of the property and its values."
        confirm="Delete property"
        onCancel={() => setAsking(false)}
        onConfirm={async (reason) => {
          if (!doomed) return;
          const id = doomed.id;
          const res = await save(() => deleteField(id, reason));
          if (res.error) return res.error;
          setFields((list) => list.filter((x) => x.id !== id));
          placed.current.delete(id);
          setAsking(false);
        }}
      />
    </>
  );
}

// An on/off switch, the same as the profile menu's Mist theme one
function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${on ? "bg-accent" : "bg-white/15"}`}
    >
      <span className={`size-3 rounded-full bg-white transition-transform duration-200 ${on ? "translate-x-3" : ""}`} />
    </button>
  );
}

// The kind of a new property: a list of every kind, each with what it holds
function KindPicker({ value, onPick }: { value: FieldKind; onPick: (k: FieldKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(FIELD_KINDS.length * 50 + 8);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const Icon = FIELD_ICONS[value];
  return (
    <div
      ref={wrap}
      className="relative"
      // Escape closes the list, not the dialog it's in
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) return setOpen(false);
          place(trigger.current, { width: 288, align: "end" });
          setOpen(true);
        }}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-colors hover:border-hover"
      >
        <Icon size={14} className="text-muted" />
        {kindLabel(value)}
        <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && position && (
        <div
          {...topLayer}
          role="listbox"
          aria-label="Kind of property"
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 max-h-[26rem] overflow-y-auto rounded-xl popover p-1 shadow-lg"
        >
          {FIELD_KINDS.map((k) => {
            const KindIcon = FIELD_ICONS[k.kind];
            const on = k.kind === value;
            return (
              <button
                key={k.kind}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onPick(k.kind);
                  setOpen(false);
                }}
                className="menu-item items-start px-2.5 py-2"
              >
                <KindIcon size={15} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{k.label}</span>
                  <span className="block text-xs text-muted">{k.hint}</span>
                </span>
                {on && <Check size={13} className="mt-1 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
