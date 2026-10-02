"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Globe,
  Hash,
  Link2,
  Mail,
  Pencil,
  Phone,
  Plus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { addOption, deleteOption, renameOption, setOptionColor } from "./actions";
import { ColorPicker, TagPill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { topLayer, useCloseOnScroll, usePopover, type PopoverPosition } from "../../popover";
import { Dropdown } from "../../Dropdown";
import { DatePicker } from "../../DatePicker";
import { Checkbox } from "../../Checkbox";
import { Reveal } from "../../Reveal";
import { InstagramIcon } from "../../PlatformIcon";
import { colorFor, initials } from "@/lib/avatar";
import { dayOf, shortDay } from "@/lib/editorKpi";
import {
  CHANNELS,
  CONTACT_ROLES,
  hexOf,
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
    default:
      return EMAIL.test(v) ? `mailto:${v}` : site(v);
  }
}

function OpenLink({ href }: { href: string | null }) {
  if (!href) return null;
  const mail = href.startsWith("mailto:");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={mail ? "Write an email" : "Open"}
      aria-label={mail ? "Write an email" : "Open"}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
    >
      {mail ? <Mail size={13} /> : <ExternalLink size={13} />}
    </a>
  );
}

// ---------- shared bits ----------

// a value cell on the lead's page: quiet until hovered, like Notion's
export const CELL = "flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/[0.04]";
const ICON_BTN = "flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground";
const Empty = () => <span className="text-sm text-muted/50">Empty</span>;

function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="chip flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px]">
      <Plus size={11} /> {label}
    </button>
  );
}

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
function useDebounced<T>(save: (v: T) => void, ms = 600) {
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
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 text-[11.5px] leading-5 text-muted"
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

// Tags (one, or any number): the chosen ones, and a Notion-style list to
// search, pick, create, rename, recolour and delete them.
export function TagEditor({ field, value, save }: { field: FieldData; value: unknown; save: (ids: string[] | null) => void }) {
  const router = useRouter();
  const multi = field.kind === "multi";
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
  const [colouring, setColouring] = useState<string | null>(null);
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
    setColouring(null);
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

  async function recolour(o: OptionData, color: string) {
    setColouring(null);
    if (color === o.color) return;
    setError(null);
    setOptions((all) => all.map((x) => (x.id === o.id ? { ...x, color } : x)));
    const res = await setOptionColor(o.id, color);
    if (res.error) {
      setError(res.error);
      setOptions((all) => all.map((x) => (x.id === o.id ? o : x)));
    } else router.refresh();
  }

  return (
    <div className="w-full min-w-0">
      <Menu
        height={340}
        width={288}
        className="w-full min-w-0"
        buttonClassName={CELL}
        onOpen={reset}
        button={picked.length ? picked.map((o) => <TagPill key={o.id} name={o.name} color={o.color} />) : <Empty />}
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
            <p className="px-2.5 pt-0.5 pb-1 text-[11px] text-muted/80">{multi ? "Pick any number, or create one" : "Pick one, or create one"}</p>
            <div className="max-h-64 overflow-y-auto">
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
                    <span className="flex shrink-0 items-center pr-1 transition-opacity group-hover/opt:opacity-100 focus-within:opacity-100 sm:opacity-0">
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
                        title="Colour"
                        aria-label={`Colour of ${o.name}`}
                        aria-expanded={colouring === o.id}
                        onClick={() => setColouring((c) => (c === o.id ? null : o.id))}
                        className={ICON_BTN}
                      >
                        <span className="size-3 rounded-full" style={{ backgroundColor: hexOf(o.color) }} />
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
                    </span>
                  </div>
                  {colouring === o.id && (
                    <div className="fade-in flex justify-center pb-1">
                      <ColorPicker value={o.color} onPick={(c) => recolour(o, c)} />
                    </div>
                  )}
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

const CHANNEL_ICON: Record<ChannelKind, React.ComponentType<{ size?: number; className?: string }>> = {
  email: Mail,
  instagram: InstagramIcon,
  linkedin: BriefcaseBusiness,
  x: AtSign,
  phone: Phone,
  other: Globe,
};
const CHANNEL_HINT: Record<ChannelKind, string> = {
  email: "name@company.com",
  instagram: "@handle or profile link",
  linkedin: "Profile link",
  x: "@handle",
  phone: "+91 98765 43210",
  other: "Link or handle",
};
const QUICK: ChannelKind[] = ["email", "instagram", "linkedin", "x", "other"];
const labelOf = (kind: ChannelKind) => CHANNELS.find((c) => c.kind === kind)?.label ?? kind;

// The people behind a lead: first how many, then each one's name, role,
// and as many emails and handles as they have
export function ContactsEditor({ value, save }: { value: unknown; save: (v: Contact[] | null) => void }) {
  const [people, setPeople] = useState<Contact[]>(() => (Array.isArray(value) ? (value as Contact[]) : []));
  const [note, setNote] = useState<string | null>(null);
  // the field a button just added, to type into at once
  const [focus, setFocus] = useState<string | null>(null);
  const later = useDebounced(save);

  function update(next: Contact[], now = false) {
    setPeople(next);
    later.schedule(next.length ? next : null);
    if (now) later.flush();
  }
  const blank = (): Contact => ({ id: crypto.randomUUID(), name: "", role: "", channels: [] });
  const isBlank = (p: Contact) => !p.name.trim() && !p.role && !p.channels.some((c) => c.value.trim());
  const patch = (id: string, change: (p: Contact) => Contact, now = false) =>
    update(
      people.map((p) => (p.id === id ? change(p) : p)),
      now,
    );

  function setCount(n: number) {
    setNote(null);
    if (n > people.length) {
      const added = Array.from({ length: n - people.length }, blank);
      setFocus(added[0].id);
      return update([...people, ...added], true);
    }
    // fewer: only empty blocks go; anyone filled in stays until removed
    const next = [...people];
    for (let i = next.length - 1; i >= 0 && next.length > n; i--) if (isBlank(next[i])) next.splice(i, 1);
    if (next.length > n) setNote("Some of these people are filled in. Remove them one by one with their ×.");
    if (next.length !== people.length) update(next, true);
  }

  const roles = [...new Set([...CONTACT_ROLES, ...people.map((p) => p.role).filter(Boolean)])];

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">How many people?</span>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={people.length === n}
            onClick={() => setCount(n)}
            className="chip flex size-7 items-center justify-center rounded-lg text-xs tabular-nums"
          >
            {n}
          </button>
        ))}
        <AddChip label="Add person" onClick={() => setCount(people.length + 1)} />
      </div>
      {note && <p className="fade-in text-xs text-muted">{note}</p>}
      {people.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              roles={roles}
              focus={focus}
              onFocusUsed={() => setFocus(null)}
              onChange={(change, now) => patch(p.id, change, now)}
              onAdd={(kind) => {
                setFocus(`${p.id}:${p.channels.length}`);
                patch(p.id, (x) => ({
                  ...x,
                  channels: [...x.channels, { kind, value: "" }],
                }));
              }}
              onRemove={() =>
                update(
                  people.filter((x) => x.id !== p.id),
                  true,
                )
              }
              onBlur={later.flush}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  person,
  roles,
  focus,
  onFocusUsed,
  onChange,
  onAdd,
  onRemove,
  onBlur,
}: {
  person: Contact;
  roles: string[];
  focus: string | null;
  onFocusUsed: () => void;
  onChange: (change: (p: Contact) => Contact, now?: boolean) => void;
  onAdd: (kind: ChannelKind) => void;
  onRemove: () => void;
  onBlur: () => void;
}) {
  // removing someone filled in takes a second click
  const [sure, setSure] = useState(false);
  const filled = !!person.name.trim() || person.channels.some((c) => c.value.trim());
  const name = person.name.trim();

  return (
    <div className="panel-soft fade-in flex min-w-0 flex-col gap-2.5 rounded-xl p-3">
      <div className="flex items-center gap-2">
        {name ? (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-black"
            style={{ backgroundColor: colorFor(name) }}
          >
            {initials(name)}
          </span>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-muted">
            <UserRound size={14} />
          </span>
        )}
        <input
          autoFocus={focus === person.id}
          onFocus={focus === person.id ? onFocusUsed : undefined}
          value={person.name}
          onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))}
          onBlur={onBlur}
          placeholder="Name"
          aria-label="Name"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none! placeholder:font-normal placeholder:text-muted/50 hover:bg-white/[0.03] focus:bg-white/[0.04]"
        />
        <Dropdown
          size="sm"
          pill={{
            icon: <BriefcaseBusiness size={12} className="text-muted" />,
          }}
          value={person.role}
          placeholder="Role"
          create
          search={{ recent: 30, placeholder: "Search or add a role" }}
          options={roles.map((r) => ({ value: r, label: r }))}
          onChange={(role) => onChange((p) => ({ ...p, role: role.trim() }), true)}
        />
        {sure ? (
          <button
            type="button"
            onClick={onRemove}
            onBlur={() => setSure(false)}
            onMouseLeave={() => setSure(false)}
            className="fade-in btn btn-xs btn-danger shrink-0"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            title="Remove this person"
            aria-label="Remove this person"
            onClick={() => (filled ? setSure(true) : onRemove())}
            className={`${ICON_BTN} hover:text-rose-300`}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {person.channels.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {person.channels.map((c, i) => (
            <ChannelRow
              key={i}
              channel={c}
              autoFocus={focus === `${person.id}:${i}`}
              onFocused={onFocusUsed}
              onBlur={onBlur}
              onChange={(next, now) =>
                onChange(
                  (p) => ({
                    ...p,
                    channels: p.channels.map((x, j) => (j === i ? next : x)),
                  }),
                  now,
                )
              }
              onRemove={() =>
                onChange(
                  (p) => ({
                    ...p,
                    channels: p.channels.filter((_, j) => j !== i),
                  }),
                  true,
                )
              }
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {QUICK.map((kind) => (
          <AddChip key={kind} label={labelOf(kind)} onClick={() => onAdd(kind)} />
        ))}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  autoFocus,
  onFocused,
  onBlur,
  onChange,
  onRemove,
}: {
  channel: Contact["channels"][number];
  autoFocus: boolean;
  onFocused: () => void;
  onBlur: () => void;
  onChange: (next: Contact["channels"][number], now?: boolean) => void;
  onRemove: () => void;
}) {
  const Icon = CHANNEL_ICON[channel.kind];
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Menu
        height={CHANNELS.length * 32 + 8}
        width={168}
        className="shrink-0"
        label={`Kind: ${labelOf(channel.kind)}`}
        buttonClassName="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
        button={
          <>
            <Icon size={13} className="shrink-0" />
            {/* on a phone the icon says it, and the address gets the room */}
            <span className="hidden w-[4.25rem] truncate text-left sm:inline">{labelOf(channel.kind)}</span>
            <ChevronDown size={11} className="shrink-0 opacity-60" />
          </>
        }
      >
        {(close) =>
          CHANNELS.map((c) => {
            const I = CHANNEL_ICON[c.kind];
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => {
                  close();
                  if (c.kind !== channel.kind) onChange({ ...channel, kind: c.kind }, true);
                }}
                className="menu-item px-2 py-1.5 text-xs"
              >
                <I size={13} className="shrink-0 text-muted" />
                {c.label}
                {c.kind === channel.kind && <Check size={13} className="ml-auto shrink-0 text-accent" />}
              </button>
            );
          })
        }
      </Menu>
      <input
        autoFocus={autoFocus}
        onFocus={autoFocus ? onFocused : undefined}
        value={channel.value}
        onChange={(e) => onChange({ ...channel, value: e.target.value })}
        onBlur={onBlur}
        placeholder={CHANNEL_HINT[channel.kind]}
        aria-label={labelOf(channel.kind)}
        className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm text-foreground outline-none! placeholder:text-muted/45 hover:bg-white/[0.03] focus:bg-white/[0.04]"
      />
      <OpenLink href={hrefOf(channel.kind, channel.value)} />
      <button type="button" title="Remove" aria-label={`Remove this ${labelOf(channel.kind)}`} onClick={onRemove} className={`${ICON_BTN} hover:text-rose-300`}>
        <X size={12} />
      </button>
    </div>
  );
}

const SUGGESTED_LINKS = ["Podcast Instagram", "YouTube channel", "Website"];

// Pages and profiles: a label and an address each
export function LinksEditor({ value, save }: { value: unknown; save: (v: LinkValue[] | null) => void }) {
  const [links, setLinks] = useState<LinkValue[]>(() => (Array.isArray(value) ? (value as LinkValue[]) : []));
  const [focus, setFocus] = useState<number | null>(null);
  const later = useDebounced(save);

  function update(next: LinkValue[], now = false) {
    setLinks(next);
    const kept = next.filter((l) => l.url.trim() || l.label.trim());
    later.schedule(kept.length ? kept : null);
    if (now) later.flush();
  }
  function add(label = "") {
    setFocus(links.length);
    setLinks([...links, { label, url: "" }]);
  }
  const unused = SUGGESTED_LINKS.filter((s) => !links.some((l) => l.label.trim().toLowerCase() === s.toLowerCase()));

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 px-1 py-1">
      {links.length > 0 && (
        <div className="flex flex-col rounded-lg border border-border/60">
          {links.map((l, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2 px-2 py-0.5 not-first:border-t not-first:border-border/40">
              <input
                autoFocus={focus === i && !l.label}
                value={l.label}
                onChange={(e) => update(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                onBlur={later.flush}
                placeholder="Label"
                aria-label="Label"
                className="w-24 shrink-0 bg-transparent py-1 text-xs text-muted outline-none! placeholder:text-muted/45 focus:text-foreground sm:w-36"
              />
              <input
                autoFocus={focus === i && !!l.label}
                value={l.url}
                onChange={(e) => update(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                onBlur={later.flush}
                placeholder="https://…"
                aria-label="Address"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none! placeholder:text-muted/45"
              />
              <OpenLink href={hrefOf("other", l.url)} />
              <button
                type="button"
                title="Remove"
                aria-label="Remove this link"
                onClick={() =>
                  update(
                    links.filter((_, j) => j !== i),
                    true,
                  )
                }
                className={`${ICON_BTN} hover:text-rose-300`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <AddChip label="Add link" onClick={() => add()} />
        {unused.map((s) => (
          <AddChip key={s} label={s} onClick={() => add(s)} />
        ))}
      </div>
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

// A line or two, saved on leaving it (Enter leaves it; Shift+Enter breaks a line)
export function TextEditor({ value, save }: { value: unknown; save: (v: string | null) => void }) {
  const saved = typeof value === "string" ? value : "";
  const [text, setText] = useState(saved);
  return (
    <textarea
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== saved.trim() && save(text.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="Empty"
      className="field-sizing-content block w-full resize-none rounded-md bg-transparent px-2 py-1 text-sm text-foreground outline-none! transition-colors placeholder:text-muted/50 hover:bg-white/[0.04] focus:bg-white/[0.04]"
    />
  );
}
