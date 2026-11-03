"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Globe, Link2, Mail, NotebookText, Phone, UserRound, Users, BriefcaseBusiness, type LucideIcon } from "lucide-react";
import { columnOf, SHEET_COLUMNS, shownAs, type SheetColumn, type SheetLead } from "@/lib/leadSheet";
import { linkName, type Contact } from "@/lib/space";
import { Avatar, formatDate } from "../../TaskCard";
import { FacebookIcon, InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { hrefOf } from "./values";
import { ShowMore } from "./LeadBoard";
import { PAGE, usePaging } from "./paging";

const HEAD = "overflow-hidden border-l border-white/[0.06] px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted first:border-l-0";
const CELL = "overflow-hidden border-l border-white/[0.06] px-3 py-2 align-top whitespace-nowrap first:border-l-0 group-hover:bg-surface-2 transition-colors";

// Each column's width, in px, until it's dragged (Abhishek, 3 Nov 2026: the
// columns resize); dragged, kept for that tab in this browser
const WIDTH: Record<string, number> = { name: 220, contact: 160, designation: 140, email: 210, phone: 150, instagram: 160, linkedin: 170, facebook: 160, website: 180, x: 140, youtube: 160, links: 200, notes: 280, by: 160, on: 120, actions: 190 };
const MIN = 80;
const MAX = 640;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const widthsKey = (tab: string) => `leads:widths:${tab}`;

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

function Head({ icon: Icon, children, className = "", resize }: { icon: React.ComponentType<{ size?: number; className?: string }> | LucideIcon; children: React.ReactNode; className?: string; resize: React.ReactNode }) {
  return (
    // relative: its edge's resizer sits in it (the frozen Name heading is sticky, which does the same)
    <th className={`${HEAD} relative ${className}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon size={13} className="shrink-0" /> <span className="truncate">{children}</span>
      </span>
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
  const keys = ["name", "contact", "designation", ...columns.map((c) => c.key), "links", "notes", "by", "on", ...(actions ? ["actions"] : [])];
  const width = keys.length;

  // the widths dragged for this tab, once in the browser (localStorage only exists after mount)
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setWidths(JSON.parse(localStorage.getItem(widthsKey(tab)) ?? "{}") as Record<string, number>); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      setWidths({});
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
            <Head icon={Users} resize={resize("contact", "Contact")}>
              Contact
            </Head>
            <Head icon={BriefcaseBusiness} resize={resize("designation", "Designation")}>
              Designation
            </Head>
            {columns.map((c) => (
              <Head key={c.key} icon={COLUMN_ICON[c.key]} resize={resize(c.key, c.label)}>
                {c.label}
              </Head>
            ))}
            <Head icon={Link2} resize={resize("links", "Links")}>
              Links
            </Head>
            <Head icon={NotebookText} resize={resize("notes", "Notes")}>
              Notes
            </Head>
            <Head icon={UserRound} resize={resize("by", "Added by")}>
              Added by
            </Head>
            <Head icon={CalendarPlus} resize={resize("on", "Added on")}>
              Added on
            </Head>
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
                <tr key={p?.id ?? "none"} className={i < span - 1 ? "border-b border-white/[0.04]" : ""}>
                  {i === 0 && (
                    <td rowSpan={span} className={`${CELL} ${FROZEN}`}>
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
                  <td className={CELL}>
                    <span className="block truncate">{p?.name}</span>
                  </td>
                  <td className={`${CELL} text-foreground/80`}>
                    <span className="block truncate">{p?.role}</span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={CELL}>
                      <Details person={p} column={c.key} />
                    </td>
                  ))}
                  {i === 0 && (
                    <>
                      <td rowSpan={span} className={CELL}>
                        <div className="flex flex-col gap-1">
                          {lead.links.map((l, j) => (
                            <span key={j} className="flex min-w-0 items-center gap-1.5">
                              <PlatformMark url={l.url} size={12} className="shrink-0 text-muted" />
                              <Out href={hrefOf("other", l.url)}>{l.label.trim() ? linkName(l.label, l.url) : shownAs({ kind: "other", value: l.url })}</Out>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td rowSpan={span} className={`${CELL} whitespace-normal`}>
                        <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">{lead.notes}</p>
                      </td>
                      <td rowSpan={span} className={CELL}>
                        <span className="flex min-w-0 items-center gap-2 text-xs">
                          <Avatar name={lead.createdBy.name} size={18} />
                          <span className="truncate">{lead.createdBy.name}</span>
                        </span>
                      </td>
                      <td rowSpan={span} className={`${CELL} text-xs text-muted tabular-nums`}>
                        {formatDate(lead.createdAt)}
                      </td>
                      {actions && (
                        <td rowSpan={span} className={CELL}>
                          <div className="flex items-center gap-1.5">{actions(lead)}</div>
                        </td>
                      )}
                    </>
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
