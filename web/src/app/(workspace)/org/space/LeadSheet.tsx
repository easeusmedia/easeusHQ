"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { CalendarPlus, Globe, Link2, Mail, NotebookText, Phone, UserRound, Users, BriefcaseBusiness, type LucideIcon } from "lucide-react";
import { arrange, columnOf, SHEET_COLUMNS, shownAs, type SheetColumn, type SheetLead } from "@/lib/leadSheet";
import { linkName, type Contact } from "@/lib/space";
import { Avatar, formatDate } from "../../TaskCard";
import { FacebookIcon, InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { hrefOf } from "./values";
import { ShowMore } from "./LeadBoard";
import { PAGE, usePaging } from "./paging";

const HEAD = "overflow-hidden border-l border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted first:border-l-0";
// a cell; every one but the Name has a line on its left. Not "first:": a
// lead's second and later people have no Name cell in their row, so their
// first cell is a person's, and it needs that line too (Abhishek, 11 Nov 2026)
const PAD = "overflow-hidden px-3 py-2 align-top whitespace-nowrap group-hover:bg-surface-2 transition-colors";
const CELL = `${PAD} border-l border-border`;

// Each column's width, in px, until it's dragged (Abhishek, 3 Nov 2026: the
// columns resize); dragged, kept for that tab in this browser
const WIDTH: Record<string, number> = { name: 220, contact: 160, designation: 140, email: 210, phone: 150, instagram: 160, linkedin: 170, facebook: 160, website: 180, x: 140, youtube: 160, links: 200, notes: 280, by: 160, on: 120, actions: 190 };
const MIN = 80;
const MAX = 640;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const widthsKey = (tab: string) => `leads:widths:${tab}`;
const orderKey = (tab: string) => `leads:order:${tab}`;

// The edge of a column's heading: drag it (or the arrow keys) to widen or
// narrow the column; a double click puts it back
function Resizer({ label, onDrag, onStep, onReset }: { label: string; onDrag: (e: React.PointerEvent<HTMLSpanElement>) => void; onStep: (by: number) => void; onReset: () => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      title="Drag to resize; double click to reset"
      tabIndex={0}
      onPointerDown={onDrag}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onStep(e.key === "ArrowLeft" ? -16 : 16);
        }
      }}
      className="group/resize absolute inset-y-0 right-0 z-20 flex w-2 cursor-col-resize touch-none justify-end outline-none"
    >
      <span className="h-full w-0.5 bg-accent/0 transition-colors group-hover/resize:bg-accent/60 group-focus-visible/resize:bg-accent/60" />
    </span>
  );
}
// the frozen name column: solid enough that rows scrolled under it don't
// show through, with a hairline on its right edge
const FROZEN = "mist-pin sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--border)] group-hover:bg-[linear-gradient(var(--surface-2),var(--surface-2))]";

const COLUMN_ICON: Record<SheetColumn, React.ComponentType<{ size?: number; className?: string }>> = {
  email: Mail,
  phone: Phone,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  facebook: FacebookIcon,
  website: Globe,
  x: XIcon,
  youtube: YoutubeIcon,
};

type Icon = React.ComponentType<{ size?: number; className?: string }> | LucideIcon;
// A column's heading: its label drags the column to another place (dropped
// on a heading, it lands on that side of it, a line showing where), its edge
// resizes it
function Head({ icon: Icon, children, resize, grip, drop, mark }: { icon: Icon; children: React.ReactNode; resize: React.ReactNode; grip: React.HTMLAttributes<HTMLSpanElement>; drop: React.HTMLAttributes<HTMLTableCellElement>; mark: "left" | "right" | null }) {
  return (
    // relative: its edge's resizer sits in it (the frozen Name heading is sticky, which does the same)
    <th className={`${HEAD} relative`} {...drop}>
      <span draggable {...grip} className="flex min-w-0 cursor-grab items-center gap-1.5 active:cursor-grabbing">
        <Icon size={13} className="shrink-0" /> <span className="truncate">{children}</span>
      </span>
      <span className={`pointer-events-none absolute inset-y-0 w-0.5 bg-accent transition-opacity ${mark === "left" ? "left-0" : "right-0"} ${mark ? "opacity-100" : "opacity-0"}`} />
      {resize}
    </th>
  );
}

// A link in a cell: opens in a new tab, never the lead
function Out({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href || /^(mailto|tel):/i.test(href)) return <span className="block min-w-0 truncate">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block min-w-0 truncate text-foreground/90 underline-offset-2 hover:text-accent hover:underline">
      {children}
    </a>
  );
}

// A person's details for one column, one a line
function Details({ person, column }: { person: Contact | undefined; column: SheetColumn }) {
  const mine = (person?.channels ?? []).filter((c) => c.value.trim() && columnOf(c) === column);
  if (!mine.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {mine.map((c, i) => (
        <Out key={i} href={hrefOf(c.kind, c.value)}>
          {shownAs(c)}
        </Out>
      ))}
    </div>
  );
}

// Sales > Leads as a spreadsheet (Abhishek, 3 Nov 2026): a lead to a block
// of rows, one row per person on it, each of their details in its own
// column (Email, Phone, Instagram, LinkedIn, Facebook, Website), so anyone
// can skim what's been collected. The lead's own cells (its name, links,
// notes, who added it, when) span its people. Newest first, ten
// leads at a time. Dead leads don't open; each has `actions` at its end
// (Restore, Delete). Every column resizes from its heading's edge, kept per
// tab (`tab`) in this browser.
export function LeadSheet({ tab, leads, filterKey, onOpen, actions }: { tab: string; leads: SheetLead[]; filterKey: string; onOpen?: (lead: SheetLead) => void; actions?: (lead: SheetLead) => React.ReactNode }) {
  const paging = usePaging(filterKey);
  const shown = leads.slice(0, paging.limit());
  // X and YouTube only when some lead here has one
  const columns = SHEET_COLUMNS.filter((c) => c.always || leads.some((l) => l.contacts.some((p) => p.channels?.some((ch) => ch.value.trim() && columnOf(ch) === c.key))));
  // every column after the frozen Name: a person's (a cell each) or the lead's (one cell down its people)
  const all: { key: string; label: string; icon: Icon; lead?: true; className?: string; cell: (p: Contact | undefined, lead: SheetLead) => React.ReactNode }[] = [
    { key: "contact", label: "Contact", icon: Users, cell: (p) => <span className="block truncate">{p?.name}</span> },
    { key: "designation", label: "Designation", icon: BriefcaseBusiness, className: "text-foreground/80", cell: (p) => <span className="block truncate">{p?.role}</span> },
    ...columns.map((c) => ({ key: c.key, label: c.label, icon: COLUMN_ICON[c.key], cell: (p: Contact | undefined) => <Details person={p} column={c.key} /> })),
    {
      key: "links",
      label: "Links",
      icon: Link2,
      lead: true,
      cell: (_, lead) => (
        <div className="flex flex-col gap-1">
          {lead.links.map((l, j) => (
            <span key={j} className="flex min-w-0 items-center gap-1.5">
              <PlatformMark url={l.url} size={12} className="shrink-0 text-muted" />
              <Out href={hrefOf("other", l.url)}>{l.label.trim() ? linkName(l.label, l.url) : shownAs({ kind: "other", value: l.url })}</Out>
            </span>
          ))}
        </div>
      ),
    },
    { key: "notes", label: "Notes", icon: NotebookText, lead: true, className: "whitespace-normal", cell: (_, lead) => <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">{lead.notes}</p> },
    {
      key: "by",
      label: "Added by",
      icon: UserRound,
      lead: true,
      cell: (_, lead) => (
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <Avatar name={lead.createdBy.name} size={18} />
          <span className="truncate">{lead.createdBy.name}</span>
        </span>
      ),
    },
    { key: "on", label: "Added on", icon: CalendarPlus, lead: true, className: "text-xs text-muted tabular-nums", cell: (_, lead) => formatDate(lead.createdAt) },
  ];

  // the order the headings were dragged into for this tab, kept in this browser like the widths
  const [saved, setSaved] = useState<string[]>([]);
  const order = arrange(
    all.map((c) => c.key),
    saved,
  );
  const cols = order.map((k) => all.find((c) => c.key === k)!);
  const keys = ["name", ...order, ...(actions ? ["actions"] : [])];
  const width = keys.length;
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // dropped on a heading: to its right when coming from the left, else its left
  function moveTo(from: string, to: string) {
    if (from === to) return;
    const next = order.filter((k) => k !== from);
    next.splice(next.indexOf(to) + (order.indexOf(from) < order.indexOf(to) ? 1 : 0), 0, from);
    try {
      localStorage.setItem(orderKey(tab), JSON.stringify(next));
    } catch {}
    // the columns ease into their places, never snap (where the browser can)
    const go = () => flushSync(() => setSaved(next));
    if (document.startViewTransition) document.startViewTransition(go);
    else go();
  }
  const markOf = (key: string) => (dragging && over === key && dragging !== key ? (order.indexOf(dragging) < order.indexOf(key) ? "right" : "left") : null);
  const end = () => {
    setDragging(null);
    setOver(null);
  };

  // the widths dragged for this tab, once in the browser (localStorage only exists after mount)
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setWidths(JSON.parse(localStorage.getItem(widthsKey(tab)) ?? "{}") as Record<string, number>); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      setWidths({});
    }
    try {
      setSaved(JSON.parse(localStorage.getItem(orderKey(tab)) ?? "[]") as string[]);
    } catch {
      setSaved([]);
    }
  }, [tab]);
  const save = (next: Record<string, number>) => {
    try {
      localStorage.setItem(widthsKey(tab), JSON.stringify(next));
    } catch {}
  };
  const w = (key: string) => widths[key] ?? WIDTH[key] ?? 160;
  const set = (key: string, n: number | null) =>
    setWidths((cur) => {
      const next = { ...cur };
      if (n == null) delete next[key];
      else next[key] = clamp(n);
      save(next);
      return next;
    });
  function drag(key: string, e: React.PointerEvent<HTMLSpanElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const from = e.clientX;
    const start = w(key);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidths((cur) => ({ ...cur, [key]: clamp(start + ev.clientX - from) }));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      // kept once let go: the widths as they stand
      setWidths((cur) => {
        save(cur);
        return cur;
      });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  const resize = (key: string, label: string) => <Resizer label={label} onDrag={(e) => drag(key, e)} onStep={(by) => set(key, w(key) + by)} onReset={() => set(key, null)} />;

  return (
    // isolate: rows easing in can't paint past the rounded corners in Safari
    <div className="fade-in isolate overflow-x-auto rounded-2xl border border-border bg-surface">
      {/* fixed layout: each column as wide as it's set, its contents cut short to fit */}
      <table className="min-w-full table-fixed border-collapse text-sm" style={{ width: keys.reduce((n, k) => n + w(k), 0) }}>
        <colgroup>
          {keys.map((k) => (
            <col key={k} style={{ width: w(k) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className={`${HEAD} ${FROZEN}`}>
              Name
              {resize("name", "Name")}
            </th>
            {cols.map((c) => (
              <Head
                key={c.key}
                icon={c.icon}
                resize={resize(c.key, c.label)}
                mark={markOf(c.key)}
                grip={{
                  onDragStart: (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.key);
                    setDragging(c.key);
                  },
                  onDragEnd: end,
                }}
                drop={{
                  onDragOver: (e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (over !== c.key) setOver(c.key);
                  },
                  onDrop: (e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    moveTo(dragging, c.key);
                    end();
                  },
                }}
              >
                {c.label}
              </Head>
            ))}
            {actions && <th className={HEAD} aria-label="Restore or delete" />}
          </tr>
        </thead>
        {shown.map((lead, n) => {
          const people: (Contact | undefined)[] = lead.contacts.length ? lead.contacts : [undefined];
          const span = people.length;
          return (
            // one body per lead, so the whole block lights on hover and opens as one
            <tbody key={lead.id} onClick={onOpen && (() => onOpen(lead))} className={`group border-b border-border last:border-b-0 ${onOpen ? "cursor-pointer" : ""} ${n >= PAGE ? "fade-in" : ""}`}>
              {people.map((p, i) => (
                <tr key={p?.id ?? "none"} className={i < span - 1 ? "border-b border-border" : ""}>
                  {i === 0 && (
                    <td rowSpan={span} className={`${PAD} ${FROZEN}`}>
                      {onOpen ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(lead);
                          }}
                          className="block max-w-full truncate rounded text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {lead.title}
                        </button>
                      ) : (
                        <span className="block truncate font-medium">{lead.title}</span>
                      )}
                    </td>
                  )}
                  {/* a lead's own cell spans its people: the rows under it skip that place */}
                  {cols.map((c) =>
                    c.lead ? (
                      i === 0 && (
                        <td key={c.key} rowSpan={span} className={`${CELL} ${c.className ?? ""}`}>
                          {c.cell(p, lead)}
                        </td>
                      )
                    ) : (
                      <td key={c.key} className={`${CELL} ${c.className ?? ""}`}>
                        {c.cell(p, lead)}
                      </td>
                    ),
                  )}
                  {i === 0 && actions && (
                    <td rowSpan={span} className={CELL}>
                      <div className="flex items-center gap-1.5">{actions(lead)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          );
        })}
        {leads.length > shown.length && (
          <tbody>
            {/* held under the names while the table scrolls sideways */}
            <tr>
              <td colSpan={width} className="p-1">
                <div className="sticky left-1 w-56">
                  <ShowMore onMore={() => paging.more()} />
                </div>
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
