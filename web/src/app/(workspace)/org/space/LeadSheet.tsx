"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Clock3, Mail, Phone, Plus } from "lucide-react";
import { arrange, shownAs, type SheetLead } from "@/lib/leadSheet";
import { hexOf, linkName, sameUrl, type Contact, type FieldData } from "@/lib/space";
import { TagPill } from "../../clients/TagPill";
import { Avatar, formatDate } from "../../TaskCard";
import { PlatformMark } from "../../PlatformIcon";
import { TagEditor, hrefOf } from "./values";
import { ShowMore } from "./LeadBoard";
import { PAGE, usePaging } from "./paging";

// a heading: small, quiet capitals, nothing between the columns
const HEAD = "relative overflow-hidden px-4 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-muted uppercase";
const CELL = "overflow-hidden px-4 py-3.5 align-middle whitespace-nowrap transition-colors group-hover:bg-white/[0.025]";
// pinned to the left (the lead) or the right (Restore, Delete): solid, so
// what scrolls under it doesn't show through, a hairline on its inner edge
const SOLID = "mist-pin bg-surface group-hover:bg-[linear-gradient(rgb(255_255_255/0.025),rgb(255_255_255/0.025)),linear-gradient(var(--surface),var(--surface))]";
const PIN_LEFT = `${SOLID} sticky left-0 z-10 shadow-[1px_0_0_var(--border)]`;
const PIN_RIGHT = `${SOLID} sticky right-0 z-10 shadow-[-1px_0_0_var(--border)]`;

// Each column's width, in px, until it's dragged; dragged, kept for that tab
// in this browser (Abhishek, 3 Nov 2026). New keys for the 20 Nov layout, so
// widths and orders kept for the old columns don't carry over.
const WIDTH: Record<string, number> = { name: 270, contact: 220, reach: 250, links: 190, notes: 280, by: 170, actions: 96 };
const MIN = 80;
const MAX = 640;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const widthsKey = (tab: string) => `leads:widths:v2:${tab}`;
const orderKey = (tab: string) => `leads:order:v2:${tab}`;

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
      <span className="my-2.5 w-px bg-white/0 transition-colors group-hover/resize:bg-accent/60 group-focus-visible/resize:bg-accent/60" />
    </span>
  );
}

// A column's heading: its label drags the column to another place (dropped
// on a heading, it lands on that side of it, a line showing where), its edge
// resizes it
function Head({ children, resize, grip, drop, mark }: { children: React.ReactNode; resize: React.ReactNode; grip: React.HTMLAttributes<HTMLSpanElement>; drop: React.HTMLAttributes<HTMLTableCellElement>; mark: "left" | "right" | null }) {
  return (
    <th className={HEAD} {...drop}>
      <span draggable {...grip} className="block min-w-0 cursor-grab truncate active:cursor-grabbing">
        {children}
      </span>
      <span className={`pointer-events-none absolute inset-y-2 w-0.5 rounded-full bg-accent transition-opacity ${mark === "left" ? "left-0" : "right-0"} ${mark ? "opacity-100" : "opacity-0"}`} />
      {resize}
    </th>
  );
}

// When a lead was added, as a glance reads it: Today, Yesterday, 12 Nov (with
// the year when it isn't this one)
const IST = 5.5 * 3600_000;
function addedWhen(iso: string, now = Date.now()): string {
  const day = (t: number) => Math.floor((t + IST) / 86_400_000);
  const ago = day(now) - day(Date.parse(iso));
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  const d = new Date(Date.parse(iso) + IST);
  const year = new Date(now + IST).getUTCFullYear() === d.getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}${year}`;
}

// A lead's first email and first phone, its first person's where they have one
function reachOf(people: Contact[]) {
  const first = (kind: "email" | "phone") => people.flatMap((p) => (p.channels ?? []).filter((c) => c.kind === kind && c.value.trim()))[0]?.value.trim() ?? null;
  return { email: first("email"), phone: first("phone") };
}

// The lead's own links (its channel, its website…), once each: its people's
// pages stay in its window (Abhishek, 20 Nov 2026: "only the main links")
function pagesOf(lead: SheetLead): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const l of lead.links) {
    const url = hrefOf("other", l.url);
    if (url && /^https?:/i.test(url) && !out.some((x) => sameUrl(x.url) === sameUrl(url))) out.push({ url, label: l.label.trim() ? linkName(l.label, l.url) : shownAs({ kind: "other", value: l.url }) });
  }
  return out;
}

// The lead's own picture (its YouTube channel's, else its Instagram's), else
// its initials; one that won't load falls back to the initials too
function LeadFace({ lead }: { lead: SheetLead }) {
  const [broken, setBroken] = useState(false);
  if (!lead.picture || broken) return <Avatar name={lead.title} size={34} presence={false} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- YouTube's own small picture, or a small kept copy
    <img src={lead.picture} alt="" width={34} height={34} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="photo size-[34px] shrink-0 rounded-full object-cover" />
  );
}

const PAGES_SHOWN = 5;
const ROUND = "grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.07] transition-colors";

// Sales > Leads (Leadwell) as a list (Abhishek, 3 Nov 2026; laid out again,
// quieter, after a CRM leads table he sent on 20 Nov): a row per lead, the
// lead pinned on the left with when it was added; its first person and
// their designation; their email and phone; every page as a small round
// mark; its notes; who added it. Newest first, ten leads at a time. Dead
// leads don't open; each has `actions` pinned on the right (Restore,
// Delete). Every column resizes from its heading's edge and moves by its
// heading, kept per tab (`tab`) in this browser.
// tagsField and onTags: the tab's Tags, picked or typed right under each name
export function LeadSheet({
  tab,
  leads,
  tagsField = null,
  onTags,
  filterKey,
  onOpen,
  actions,
}: {
  tab: string;
  leads: SheetLead[];
  tagsField?: FieldData | null;
  onTags?: (lead: SheetLead, ids: string[]) => void;
  filterKey: string;
  onOpen?: (lead: SheetLead) => void;
  actions?: (lead: SheetLead) => React.ReactNode;
}) {
  const tags = tagsField?.options ?? [];
  const paging = usePaging(filterKey);
  const shown = leads.slice(0, paging.limit());
  // every column after the pinned lead
  const all: { key: string; label: string; cell: (lead: SheetLead) => React.ReactNode }[] = [
    {
      key: "contact",
      label: "Contact",
      cell: (lead) => {
        const [first, ...rest] = lead.contacts.filter((p) => p.name.trim() || p.role.trim());
        if (!first) return null;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground/90">{first.name.trim() || first.role}</p>
              {first.name.trim() && first.role.trim() && <p className="truncate text-xs text-muted">{first.role}</p>}
            </div>
            {rest.length > 0 && (
              <span title={rest.map((p) => [p.name, p.role].filter((x) => x.trim()).join(", ")).join("\n")} className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted tabular-nums">
                +{rest.length}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "reach",
      label: "Email & phone",
      cell: (lead) => {
        const { email, phone } = reachOf(lead.contacts);
        if (!email && !phone) return null;
        return (
          <div className="flex min-w-0 flex-col gap-1 text-[13px] text-foreground/85">
            {email && (
              <span className="flex min-w-0 items-center gap-2">
                <Mail size={13} className="shrink-0 text-muted" />
                <span className="truncate">{email}</span>
              </span>
            )}
            {phone && (
              <span className="flex min-w-0 items-center gap-2 tabular-nums">
                <Phone size={13} className="shrink-0 text-muted" />
                <span className="truncate">{phone}</span>
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "links",
      label: "Links",
      cell: (lead) => {
        const pages = pagesOf(lead);
        const more = pages.length - PAGES_SHOWN;
        return (
          <div className="flex items-center gap-1.5">
            {pages.slice(0, PAGES_SHOWN).map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" title={p.label} aria-label={p.label} onClick={(e) => e.stopPropagation()} className={`${ROUND} text-muted hover:bg-white/[0.08] hover:text-foreground hover:ring-white/15`}>
                <PlatformMark url={p.url} size={13} />
              </a>
            ))}
            {more > 0 && (
              <span title={pages.slice(PAGES_SHOWN).map((p) => p.label).join("\n")} className="pl-0.5 text-[11px] text-muted tabular-nums">
                +{more}
              </span>
            )}
          </div>
        );
      },
    },
    { key: "notes", label: "Notes", cell: (lead) => <p title={lead.notes} className="truncate text-[13px] text-muted">{lead.notes}</p> },
    {
      key: "by",
      label: "Added by",
      cell: (lead) => (
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground/85">
          <Avatar name={lead.createdBy.name} size={22} />
          <span className="truncate">{lead.createdBy.name}</span>
        </span>
      ),
    },
  ];

  // the order the headings were dragged into for this tab, kept in this browser like the widths
  const [saved, setSaved] = useState<string[]>([]);
  const order = arrange(
    all.map((c) => c.key),
    saved,
  );
  const cols = order.map((k) => all.find((c) => c.key === k)!);
  const keys = ["name", ...order, ...(actions ? ["actions"] : [])];
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
  const w = (key: string) => widths[key] ?? WIDTH[key] ?? 180;
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
    <div className="fade-in isolate overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        {/* fixed layout: each column as wide as it's set, its contents cut short to fit */}
        <table className="min-w-full table-fixed border-collapse text-sm" style={{ width: keys.reduce((n, k) => n + w(k), 0) }}>
          <colgroup>
            {keys.map((k) => (
              <col key={k} style={{ width: w(k) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-white/[0.02]">
              <th className={`${HEAD} ${PIN_LEFT} bg-[linear-gradient(rgb(255_255_255/0.02),rgb(255_255_255/0.02)),linear-gradient(var(--surface),var(--surface))]`}>
                Lead
                {resize("name", "Lead")}
              </th>
              {cols.map((c) => (
                <Head
                  key={c.key}
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
              {actions && <th className={`${HEAD} ${PIN_RIGHT}`} aria-label="Restore or delete" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((lead, n) => (
              <tr key={lead.id} onClick={onOpen && (() => onOpen(lead))} className={`group border-t border-white/[0.06] ${onOpen ? "cursor-pointer" : ""} ${n >= PAGE ? "fade-in" : ""}`}>
                <td className={`${CELL} ${PIN_LEFT}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <LeadFace lead={lead} />
                    <div className="min-w-0">
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
                      {/* its tags right under its name, in their colours, then when it was added (Abhishek, 20 Nov 2026) */}
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
                        {lead.tags.flatMap((t) => tags.filter((o) => o.id === t)).map((o) => (
                          <TagPill key={o.id} name={o.name} color={hexOf(o.color)} size="mini" />
                        ))}
                        {/* a tag picked or typed here, without opening the lead */}
                        {tagsField && onTags && (
                          <span onClick={(e) => e.stopPropagation()} className="flex">
                            <TagEditor
                              field={tagsField}
                              value={lead.tags}
                              save={(ids) => onTags(lead, ids ?? [])}
                              trigger={{
                                label: `Tags for ${lead.title}`,
                                className: "flex h-[18px] items-center gap-1 rounded-full border border-dashed border-white/15 px-1.5 text-[10.5px] text-muted transition-colors hover:border-white/30 hover:text-foreground",
                                button: (
                                  <>
                                    <Plus size={10} />
                                    {lead.tags.length ? "" : "Tag"}
                                  </>
                                ),
                              }}
                            />
                          </span>
                        )}
                        <span title={`Added ${formatDate(lead.createdAt)} by ${lead.createdBy.name}`} className="flex shrink-0 items-center gap-1">
                          <Clock3 size={11} className="shrink-0" />
                          {addedWhen(lead.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={CELL}>
                    {c.cell(lead)}
                  </td>
                ))}
                {actions && (
                  <td className={`${CELL} ${PIN_RIGHT}`}>
                    <div className="flex items-center justify-end gap-1.5">{actions(lead)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* the next ten, then how many show: on the left, clear of Nyra's button (Abhishek, 20 Nov 2026) */}
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
        {leads.length > shown.length && (
          <div className="w-40">
            <ShowMore onMore={() => paging.more()} />
          </div>
        )}
        <p className="text-xs text-muted tabular-nums">
          Showing {shown.length} of {leads.length}
        </p>
      </div>
    </div>
  );
}
