"use client";

import { Fragment } from "react";
import { CalendarPlus, CircleDot, UserRound } from "lucide-react";
import type { BoardData, LeadData } from "@/lib/space";
import { Avatar, formatDate } from "../../TaskCard";
import { CalendarDays, Contact, Hash, Link2, SquareCheck, Tag, Tags, TextAlignStart, type LucideIcon } from "lucide-react";
import type { FieldKind } from "@/lib/space";

// One glyph per kind of property
const FIELD_ICONS: Record<FieldKind, LucideIcon> = {
  select: Tag,
  multi: Tags,
  count: Hash,
  contacts: Contact,
  links: Link2,
  checkbox: SquareCheck,
  date: CalendarDays,
  text: TextAlignStart,
};
import { StagePill } from "./pills";
import { ValueView } from "./values";
import { ShowMore } from "./LeadBoard";
import { PAGE, pageByGroup, usePaging } from "./paging";

const HEAD = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted";
const CELL = "px-3 py-2 align-middle whitespace-nowrap";
// the frozen name column: solid enough that rows scrolled under it don't
// show through, with a hairline on its right edge
const FROZEN = "mist-pin sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--border)]";

// The same leads as a Notion table: one row each, a column per property.
// Wide boards scroll sideways while the name stays put. Each stage shows ten
// rows at a time, ten more on each Show more (back to 10 with a new search
// or filter).
export function LeadTable({ board, leads, filtered, filterKey, onOpen }: { board: BoardData; leads: LeadData[]; filtered: boolean; filterKey: string; onOpen: (id: string) => void }) {
  const paging = usePaging(filterKey);
  const stageAt = new Map(board.stages.map((s, i) => [s.id, i]));
  const rows = [...leads].sort((a, b) => (stageAt.get(a.stageId) ?? 0) - (stageAt.get(b.stageId) ?? 0) || a.sortOrder - b.sortOrder);

  if (!rows.length) {
    return (
      <p className="fade-in rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted">
        {filtered ? "No leads match these filters." : "No leads yet. Add the first one from the board view."}
      </p>
    );
  }

  return (
    // isolate: rows easing in can't paint past the rounded corners in Safari
    <div className="fade-in isolate overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={`${HEAD} ${FROZEN} min-w-56`}>Name</th>
            <th className={HEAD}>
              <span className="inline-flex items-center gap-1.5">
                <CircleDot size={13} /> Stage
              </span>
            </th>
            <th className={HEAD}>
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={13} /> Added by
              </span>
            </th>
            {board.fields.map((f) => {
              const Icon = FIELD_ICONS[f.kind];
              return (
                <th key={f.id} className={HEAD}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={13} /> {f.name}
                  </span>
                </th>
              );
            })}
            <th className={HEAD}>
              <span className="inline-flex items-center gap-1.5">
                <CalendarPlus size={13} /> Created
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageByGroup(rows, (l) => l.stageId, paging.limit).map(({ group, shown, more }) => (
            <Fragment key={group}>
              {shown.map((lead, n) => {
                const stage = board.stages.find((s) => s.id === lead.stageId);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => onOpen(lead.id)}
                    className={`group cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2 ${n >= PAGE ? "fade-in" : ""}`}
                  >
                    <td className={`${CELL} ${FROZEN} group-hover:bg-[linear-gradient(var(--surface-2),var(--surface-2))]`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(lead.id);
                        }}
                        className="block max-w-80 truncate rounded text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
                        {lead.title}
                      </button>
                    </td>
                    <td className={CELL}>{stage && <StagePill name={stage.name} color={stage.color} />}</td>
                    <td className={CELL}>
                      <span className="flex items-center gap-2 text-xs">
                        <Avatar name={lead.createdBy.name} size={18} />
                        {lead.createdBy.name}
                      </span>
                    </td>
                    {board.fields.map((f) => (
                      <td key={f.id} className={CELL}>
                        <div className="flex max-w-64 min-w-0 items-center gap-1 overflow-hidden">
                          <ValueView field={f} value={lead.values[f.id]} compact />
                        </div>
                      </td>
                    ))}
                    <td className={`${CELL} text-xs text-muted tabular-nums`}>{formatDate(lead.createdAt)}</td>
                  </tr>
                );
              })}
              {/* under the stage's last row, held under the names while the table scrolls sideways */}
              {more && (
                <tr className="border-b border-border last:border-b-0">
                  <td colSpan={board.fields.length + 4} className="p-1">
                    <div className="sticky left-1 w-56">
                      <ShowMore onMore={() => paging.more(group)} />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
