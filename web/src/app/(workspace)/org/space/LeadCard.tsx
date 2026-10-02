"use client";

import { Fragment } from "react";
import { CircleAlert } from "lucide-react";
import { daysSince, isFilled, missingDetails, type FieldData, type LeadData } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { ValueView } from "./values";

// One lead on the board, shaped like a task card: its name, then who added
// it and how long it has sat in this stage. Basic details still missing show
// as a small amber count (named on hover). Its properties show only when the
// board's "Details" is on.
export function LeadCard({ lead, fields, details, onOpen }: { lead: LeadData; fields: FieldData[]; details: boolean; onOpen: (id: string) => void }) {
  const shown = details ? fields.filter((f) => f.onCard && isFilled(f.kind, lead.values[f.id])) : [];
  const missing = missingDetails(fields, lead.values);
  const days = daysSince(lead.stageSince);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead.id);
        }
      }}
      className="card-surface card-interactive group relative flex cursor-pointer flex-col gap-2 rounded-xl p-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <p className="line-clamp-2 leading-snug font-medium break-words">{lead.title}</p>

      {shown.length > 0 && (
        <dl className="fade-in grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1.5 text-[11.5px]">
          {shown.map((f) => (
            <Fragment key={f.id}>
              <dt className="truncate pt-0.5 text-muted" title={f.name}>
                {f.name}
              </dt>
              <dd className="flex min-w-0 flex-wrap gap-1">
                <ValueView field={f} value={lead.values[f.id]} compact />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}

      <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <Avatar name={lead.createdBy.name} size={18} />
        <span className="min-w-0 truncate" title={`Added by ${lead.createdBy.name}`}>
          {lead.createdBy.name.split(" ")[0]}
        </span>
        {missing.length > 0 && (
          <span title={`Still to fill: ${missing.join(", ")}`} className="flex shrink-0 items-center gap-1 text-amber-300/90">
            <CircleAlert size={12} />
            {missing.length}
          </span>
        )}
        <span title="Days since it moved into this stage" className="ml-auto shrink-0 tabular-nums">
          {days === 0 ? "Today" : `${days}d`}
        </span>
      </div>
    </div>
  );
}
