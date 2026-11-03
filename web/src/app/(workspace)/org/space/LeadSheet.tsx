"use client";

import { CalendarPlus, Globe, Link2, Mail, NotebookText, Phone, UserRound, Users, BriefcaseBusiness, type LucideIcon } from "lucide-react";
import { columnOf, SHEET_COLUMNS, shownAs, type SheetColumn, type SheetLead } from "@/lib/leadSheet";
import { linkName, type Contact } from "@/lib/space";
import { Avatar, formatDate } from "../../TaskCard";
import { FacebookIcon, InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { hrefOf } from "./values";
import { ShowMore } from "./LeadBoard";
import { PAGE, usePaging } from "./paging";

const HEAD = "border-l border-white/[0.06] px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted first:border-l-0";
const CELL = "border-l border-white/[0.06] px-3 py-2 align-top whitespace-nowrap first:border-l-0 group-hover:bg-surface-2 transition-colors";
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

function Head({ icon: Icon, children, className = "" }: { icon: React.ComponentType<{ size?: number; className?: string }> | LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <th className={`${HEAD} ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <Icon size={13} /> {children}
      </span>
    </th>
  );
}

// A link in a cell: opens in a new tab, never the lead
function Out({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href || /^(mailto|tel):/i.test(href)) return <span className="block max-w-56 truncate">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block max-w-56 truncate text-foreground/90 underline-offset-2 hover:text-accent hover:underline">
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
// (Restore, Delete).
export function LeadSheet({ leads, filterKey, onOpen, actions }: { leads: SheetLead[]; filterKey: string; onOpen?: (lead: SheetLead) => void; actions?: (lead: SheetLead) => React.ReactNode }) {
  const paging = usePaging(filterKey);
  const shown = leads.slice(0, paging.limit());
  // X and YouTube only when some lead here has one
  const columns = SHEET_COLUMNS.filter((c) => c.always || leads.some((l) => l.contacts.some((p) => p.channels?.some((ch) => ch.value.trim() && columnOf(ch) === c.key))));
  const width = 7 + columns.length + (actions ? 1 : 0);

  return (
    // isolate: rows easing in can't paint past the rounded corners in Safari
    <div className="fade-in isolate overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={`${HEAD} ${FROZEN} min-w-52`}>Name</th>
            <Head icon={Users}>Contact</Head>
            <Head icon={BriefcaseBusiness}>Designation</Head>
            {columns.map((c) => (
              <Head key={c.key} icon={COLUMN_ICON[c.key]}>
                {c.label}
              </Head>
            ))}
            <Head icon={Link2}>Links</Head>
            <Head icon={NotebookText}>Notes</Head>
            <Head icon={UserRound}>Added by</Head>
            <Head icon={CalendarPlus}>Added on</Head>
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
                          className="block max-w-72 truncate rounded text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {lead.title}
                        </button>
                      ) : (
                        <span className="block max-w-72 truncate font-medium">{lead.title}</span>
                      )}
                    </td>
                  )}
                  <td className={CELL}>
                    <span className="block max-w-48 truncate">{p?.name}</span>
                  </td>
                  <td className={`${CELL} text-foreground/80`}>
                    <span className="block max-w-40 truncate">{p?.role}</span>
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
                            <span key={j} className="flex items-center gap-1.5">
                              <PlatformMark url={l.url} size={12} className="text-muted" />
                              <Out href={hrefOf("other", l.url)}>{l.label.trim() ? linkName(l.label, l.url) : shownAs({ kind: "other", value: l.url })}</Out>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td rowSpan={span} className={`${CELL} whitespace-normal`}>
                        <p className="line-clamp-3 w-64 text-xs leading-relaxed text-foreground/80">{lead.notes}</p>
                      </td>
                      <td rowSpan={span} className={CELL}>
                        <span className="flex items-center gap-2 text-xs">
                          <Avatar name={lead.createdBy.name} size={18} />
                          {lead.createdBy.name}
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
