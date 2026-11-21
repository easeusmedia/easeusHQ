"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Hash,
  Link2,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { channelOf, instagramOf } from "@/lib/channelStats";
import { addOption, deleteOption, renameOption } from "./actions";
import { TagPill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { topLayer, useCloseOnScroll, usePopover, type PopoverPosition } from "../../popover";
import { DatePicker } from "../../DatePicker";
import { Checkbox } from "../../Checkbox";
import { Reveal } from "../../Reveal";
import { dayOf, shortDay } from "@/lib/editorKpi";
import {
  isFilled,
  type ChannelKind,
  type Contact,
  type CountValue,
  type FieldData,
  type LinkValue,
  type OptionData,
} from "@/lib/space";

// A lead's property values: how each kind reads on a card or in the table
// (ValueView), and the editors its page (LeadPeek) uses for each kind.

// ---------- dates ----------

// "1 Oct", with the year when it isn't this one, from a yyyy-mm-dd day
export function dayLabel(day: string) {
  const year = day.slice(0, 4);
  return year === dayOf(new Date()).slice(0, 4) ? shortDay(day) : `${shortDay(day)} ${year}`;
}
// the same for a moment, as the day it was in India
export const dateOf = (iso: string) => dayLabel(dayOf(new Date(iso)));

// ---------- links ----------

const site = (v: string) => (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) ? `https://${v}` : null);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// the lead's channel as an address that opens: its YouTube channel, else its
// Instagram (a link, or a contact's); the cards and the lead window read it alike
export function channelHref(values: Record<string, unknown>, fields: { id: string; kind: string }[]): string | null {
  const c = channelOf(values, fields);
  return (c && hrefOf("other", c.url)) ?? instagramOf(values, fields);
}

// Where a typed address opens, or null when it isn't one. Only web, mail
// and phone links are ever built, so nothing typed can run as a script.
export function hrefOf(kind: ChannelKind, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (kind) {
    case "phone":
      return /^\+?[\d\s()-]{6,}$/.test(v) ? `tel:${v.replace(/[^\d+]/g, "")}` : null;
    case "instagram":
      return /^[\w.]+$/.test(handle) ? `https://instagram.com/${handle}` : site(v);
    case "x":
      return /^\w+$/.test(handle) ? `https://x.com/${handle}` : site(v);
    case "youtube":
      return /^[\w.-]+$/.test(handle) ? `https://youtube.com/@${handle}` : site(v);
    default:
      return EMAIL.test(v) ? `mailto:${v}` : site(v);
  }
}

// ---------- shared bits ----------

// a value cell on the lead's page: quiet until hovered, like Notion's
export const CELL = "flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/[0.04]";
const ICON_BTN = "flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground";
const Empty = () => <span className="text-sm text-muted/50">Empty</span>;

// A block of the lead's page (Details, Contacts, Messages): a hairline edge,
// its heading on a bar, and a line between the heading and what's in it
export const SECTION = "rounded-xl border border-white/[0.07] bg-foreground/[0.025]";
export const SECTION_HEAD = "flex min-h-11 items-center gap-2 px-3.5 py-2 text-xs";
export const SECTION_TITLE = "text-[13px] font-medium text-foreground/90";
export const SECTION_BODY = "border-t border-white/[0.06] p-3";

// A button with a menu hanging from it, in the top layer (popover.ts) so no
// scrolling box crops it. It closes on a click outside, Escape, or a scroll
// anywhere but inside the menu itself (a long list scrolls). The menu's
// contents get `close`, for picks that should shut it.
export function Menu({
  height,
  width,
  align,
  popup = "listbox",
  label,
  className = "",
  buttonClassName,
  button,
  onOpen,
  children,
}: {
  height: number;
  width?: number;
  align?: "start" | "end";
  popup?: "listbox" | "menu";
  label?: string;
  className?: string;
  buttonClassName: string;
  button: React.ReactNode;
  onOpen?: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(height);
  const close = useCallback(() => setOpen(false), []);
  const closeOnScroll = useCallback((e?: Event) => {
    if (e?.type === "scroll" && wrapRef.current?.contains(e.target as Node)) return;
    setOpen(false);
  }, []);
  useCloseOnScroll(open, closeOnScroll);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={className}
      // Escape closes the menu, not the window it sits in
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup={popup}
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          if (open) return setOpen(false);
          onOpen?.();
          place(triggerRef.current, { width, align });
          setOpen(true);
        }}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && position && <MenuPanel position={position}>{children(close)}</MenuPanel>}
    </div>
  );
}

export function MenuPanel({ position, className = "", children }: { position: PopoverPosition; className?: string; children: React.ReactNode }) {
  return (
    <div
      {...topLayer}
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
      }}
      className={`pop-in fixed z-50 rounded-xl popover p-1 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

// Typing saves a moment after it stops (and on leaving the field, and if
// the editor goes while a save is waiting), not on every key.
export function useDebounced<T>(save: (v: T) => void, ms = 600) {
  const latest = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<{ v: T } | null>(null);
  useEffect(() => {
    latest.current = save;
  });
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) latest.current(p.v);
  }, []);
  const schedule = useCallback(
    (v: T) => {
      pending.current = { v };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [flush, ms],
  );
  useEffect(() => flush, [flush]);
  return { schedule, flush };
}

// ---------- read-only ----------

// a small neutral label beside the tags on a card
function Meta({ icon, children, title }: { icon?: React.ReactNode; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 text-[12.5px] leading-5 text-muted"
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A value as it reads on a card (compact) or anywhere with more room.
// Nothing at all when it's empty.
export function ValueView({ field, value, compact = false }: { field: FieldData; value: unknown; compact?: boolean }) {
  if (!isFilled(field.kind, value)) return null;
  switch (field.kind) {
    case "select":
    case "multi": {
      const tags = (value as string[]).flatMap((id) => field.options.filter((o) => o.id === id));
      if (!tags.length) return null;
      const pills = tags.map((t) => <TagPill key={t.id} name={t.name} color={t.color} wrap={compact} />);
      // compact: loose, so the card or cell around them decides the wrapping
      return compact ? <>{pills}</> : <span className="flex min-w-0 flex-wrap gap-1">{pills}</span>;
    }
    case "count": {
      const { n, remark } = value as CountValue;
      // the count is of shorts on the outreach boards; elsewhere, just the number
      const label = /short|reel/i.test(field.name) ? plural(n ?? 0, "short", "shorts") : String(n);
      if (compact)
        return (
          <Meta icon={<Hash size={11} />} title={remark || field.name}>
            {label}
          </Meta>
        );
      return (
        <span className="line-clamp-2 min-w-0 text-xs text-foreground/85">
          <span className="tabular-nums">{label}</span>
          {remark && <span className="text-muted"> · {remark}</span>}
        </span>
      );
    }
    case "contacts": {
      const people = value as Contact[];
      const label = plural(people.length, "person", "people");
      const names = people
        .map((p) => [p.name, p.role && `(${p.role})`].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(", ");
      if (compact)
        return (
          <Meta icon={<Users size={11} />} title={names}>
            {label}
          </Meta>
        );
      return <span className="truncate text-xs text-foreground/85">{names ? `${label}: ${names}` : label}</span>;
    }
    case "links": {
      const label = plural((value as LinkValue[]).length, "link", "links");
      return compact ? <Meta icon={<Link2 size={11} />}>{label}</Meta> : <span className="text-xs text-foreground/85">{label}</span>;
    }
    case "checkbox":
      return (
        <span
          title={field.name}
          aria-label={`${field.name}: yes`}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-foreground text-background"
        >
          <Check size={11} strokeWidth={3} />
        </span>
      );
    case "date":
      return compact ? (
        <Meta icon={<CalendarDays size={11} />} title={field.name}>
          {dayLabel(String(value))}
        </Meta>
      ) : (
        <span className="text-xs text-foreground/85">{dayLabel(String(value))}</span>
      );
    case "text":
      return compact ? (
        <Meta title={String(value)}>{String(value)}</Meta>
      ) : (
        <span className="line-clamp-2 min-w-0 text-xs text-foreground/85">{String(value)}</span>
      );
  }
}

// ---------- editors ----------

// Whether the person can rename and delete the board's own pieces (tags, message
// templates): lib/scope setsUp. Set by PortalView.
export const CanBuild = createContext(false);

// Tags (one, or any number): the chosen ones, and a Notion-style list to
// search, pick and create them; whoever sets the app up also renames and
// deletes them. `trigger` swaps the chosen tags for a button of its own (the
// lead window's +, beside its pills).
export function TagEditor({ field, value, save, trigger }: { field: FieldData; value: unknown; save: (ids: string[] | null) => void; trigger?: { button: React.ReactNode; label: string; className: string } }) {
  const router = useRouter();
  const multi = field.kind === "multi";
  const canBuild = useContext(CanBuild);
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  // the property's tags, changed here at once and settled by the refresh
  const [options, setOptions] = useState(field.options);
  const [synced, setSynced] = useState(field.options);
  if (field.options !== synced) {
    setSynced(field.options);
    setOptions(field.options);
  }
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the tag being deleted (kept while its prompt fades out)
  const [target, setTarget] = useState<OptionData | null>(null);
  const [confirming, setConfirming] = useState(false);

  const q = query.trim();
  const shown = q ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : options;
  const exact = options.find((o) => o.name.toLowerCase() === q.toLowerCase());
  const picked = chosen.flatMap((id) => options.filter((o) => o.id === id));

  function reset() {
    setQuery("");
    setRenaming(null);
    setError(null);
  }

  // one tag swaps (and shuts the list); several toggle
  function choose(id: string, close: () => void) {
    if (multi) {
      const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
      save(next.length ? next : null);
    } else {
      save(chosen.includes(id) ? null : [id]);
      close();
    }
  }

  async function create(close: () => void) {
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const res = await addOption(field.id, q);
    setBusy(false);
    if (res.error || !res.option) return setError(res.error ?? "That tag couldn't be added.");
    const o = res.option;
    setOptions((all) => (all.some((x) => x.id === o.id) ? all : [...all, o]));
    setQuery("");
    if (!chosen.includes(o.id)) save(multi ? [...chosen, o.id] : [o.id]);
    if (!multi) close();
    router.refresh();
  }

  async function rename() {
    if (!renaming) return;
    const before = options.find((o) => o.id === renaming.id);
    const name = renaming.name.trim().replace(/\s+/g, " ");
    setRenaming(null);
    if (!before || !name || name === before.name) return;
    setError(null);
    setOptions((all) => all.map((o) => (o.id === before.id ? { ...o, name } : o)));
    const res = await renameOption(before.id, name);
    if (res.error) {
      setError(res.error);
      setOptions((all) => all.map((o) => (o.id === before.id ? before : o)));
    } else router.refresh();
  }

  return (
    <div className={trigger ? "" : "w-full min-w-0"}>
      <Menu
        height={340}
        width={288}
        label={trigger?.label}
        className={trigger ? "" : "w-full min-w-0"}
        buttonClassName={trigger?.className ?? CELL}
        onOpen={reset}
        button={trigger?.button ?? (picked.length ? picked.map((o) => <TagPill key={o.id} name={o.name} color={o.color} />) : <Empty />)}
      >
        {(close) => (
          <>
            <div className="px-1 pt-1 pb-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  // an existing tag first, so a half-typed name never makes a new one
                  const hit = exact ?? shown[0];
                  if (hit) choose(hit.id, close);
                  else create(close);
                }}
                placeholder="Search or create a tag"
                aria-label="Search or create a tag"
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none! placeholder:text-muted"
              />
            </div>
            <p className="px-2.5 pt-0.5 pb-1 text-[12px] text-muted/80">{multi ? "Pick any number, or create one" : "Pick one, or create one"}</p>
            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {shown.map((o) => (
                <div key={o.id}>
                  <div className="group/opt flex items-center gap-0.5 rounded-lg transition-colors hover:bg-white/[0.06]">
                    {renaming?.id === o.id ? (
                      <input
                        autoFocus
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: o.id, name: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={rename}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenaming(null);
                          }
                        }}
                        aria-label="Tag name"
                        className="mx-1 my-0.5 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:border-hover"
                      />
                    ) : (
                      <button type="button" onClick={() => choose(o.id, close)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                        <TagPill name={o.name} color={o.color} />
                        {chosen.includes(o.id) && <Check size={13} className="ml-auto shrink-0 text-accent" />}
                      </button>
                    )}
                    {/* on a phone there's no hover, so they always show there */}
                    {canBuild && <span className="flex shrink-0 items-center pr-1 transition-opacity group-hover/opt:opacity-100 focus-within:opacity-100 sm:opacity-0 pointer-coarse:opacity-100">
                      <button
                        type="button"
                        title="Rename"
                        aria-label={`Rename ${o.name}`}
                        onClick={() => setRenaming({ id: o.id, name: o.name })}
                        className={ICON_BTN}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        title="Delete tag"
                        aria-label={`Delete ${o.name}`}
                        onClick={() => {
                          close();
                          setTarget(o);
                          setConfirming(true);
                        }}
                        className={`${ICON_BTN} hover:text-rose-300`}
                      >
                        <X size={12} />
                      </button>
                    </span>}
                  </div>
                </div>
              ))}
              {!options.length && !q && <p className="px-2.5 py-1.5 text-xs text-muted">No tags yet. Type one above to create it.</p>}
            </div>
            {q && !exact && (
              <button type="button" disabled={busy} onClick={() => create(close)} className="menu-item px-2 py-1.5 text-xs disabled:opacity-60">
                <span className="shrink-0 text-muted">{busy ? "Creating" : "Create"}</span>
                <TagPill name={q} color="default" />
              </button>
            )}
            {error && (
              <p role="alert" className="fade-in px-2.5 py-1.5 text-xs text-red-300">
                {error}
              </p>
            )}
          </>
        )}
      </Menu>
      <ReasonDialog
        open={confirming}
        danger
        title={`Delete the tag “${target?.name ?? ""}”?`}
        hint="It comes off every lead that has it. The reason is kept with what was deleted."
        confirm="Delete tag"
        onCancel={() => setConfirming(false)}
        onConfirm={async (reason) => {
          if (!target) return;
          const res = await deleteOption(target.id, reason);
          if (res.error) return res.error;
          setOptions((all) => all.filter((o) => o.id !== target.id));
          setConfirming(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// A number (how many shorts), then a remark about them once it's picked
export function CountEditor({ value, save }: { value: unknown; save: (v: CountValue | null) => void }) {
  const start = (value as CountValue | undefined) ?? { n: null, remark: "" };
  const [n, setN] = useState<number | null>(start.n);
  const [remark, setRemark] = useState(start.remark ?? "");
  // higher than the chips go, as typed
  const [more, setMore] = useState(start.n != null && start.n > 10 ? String(start.n) : "");
  const later = useDebounced(save);
  const send = (next: CountValue, now = false) => {
    later.schedule(next.n == null && !next.remark.trim() ? null : next);
    if (now) later.flush();
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 px-1 py-1">
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: 11 }, (_, k) => (
          <button
            key={k}
            type="button"
            aria-pressed={n === k}
            onClick={() => {
              setN(k);
              setMore("");
              send({ n: k, remark }, true);
            }}
            className="chip flex size-7 items-center justify-center rounded-lg text-xs tabular-nums"
          >
            {k}
          </button>
        ))}
        <input
          type="number"
          min={0}
          max={9999}
          inputMode="numeric"
          value={more}
          onChange={(e) => {
            setMore(e.target.value);
            const k = Number(e.target.value);
            if (e.target.value === "" || !Number.isInteger(k) || k < 0 || k > 9999) return;
            setN(k);
            send({ n: k, remark });
          }}
          onBlur={later.flush}
          placeholder="More"
          aria-label="A higher number"
          className={`h-7 w-16 rounded-lg border bg-transparent px-2 text-xs tabular-nums text-foreground outline-none placeholder:text-muted/60 focus:border-hover ${n != null && n > 10 ? "border-accent/50" : "border-border"}`}
        />
        {(n != null || remark) && (
          <button
            type="button"
            title="Clear"
            aria-label="Clear"
            onClick={() => {
              setN(null);
              setRemark("");
              setMore("");
              send({ n: null, remark: "" }, true);
            }}
            className={ICON_BTN}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <Reveal open={n != null || !!remark}>
        <textarea
          value={remark}
          onChange={(e) => {
            setRemark(e.target.value);
            send({ n, remark: e.target.value });
          }}
          onBlur={later.flush}
          rows={2}
          placeholder="What are they like? Quality, style, hooks…"
          aria-label="Remark"
          className="field-sizing-content block max-h-60 min-h-16 w-full resize-none rounded-lg border border-border/70 bg-white/[0.02] px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-hover"
        />
      </Reveal>
    </div>
  );
}

export function CheckboxEditor({ field, value, save }: { field: FieldData; value: unknown; save: (v: true | null) => void }) {
  return (
    <div className="flex min-h-8 items-center px-2">
      <Checkbox checked={value === true} onChange={(on) => save(on ? true : null)} label={field.name} />
    </div>
  );
}

export function DateEditor({ value, save }: { value: unknown; save: (v: string | null) => void }) {
  return (
    <div className="px-1">
      <DatePicker pill={{}} value={typeof value === "string" ? value : ""} onChange={(v) => save(v || null)} placeholder="Empty" />
    </div>
  );
}

