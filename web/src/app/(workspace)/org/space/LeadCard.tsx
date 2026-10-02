"use client";

import { CircleAlert } from "lucide-react";
import { daysSince, isFilled, missingDetails, type FieldData, type LeadData } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { ValueView } from "./values";

// One lead on the board, Notion-style: its name, the properties picked to
// show on cards, then who has it and how long it has sat in this stage.
// Basic details still missing show as a quiet amber line, so a half-filled
// lead is easy to spot before it moves on.
export function LeadCard({ lead, fields, onOpen }: { lead: LeadData; fields: FieldData[]; onOpen: (id: string) => void }) {
  const shown = fields.filter((f) => f.onCard && isFilled(f.kind, lead.values[f.id]));
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
      className="card-surface card-interactive fade-in flex cursor-pointer flex-col gap-2.5 rounded-xl p-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <p className="line-clamp-2 text-sm leading-snug font-medium break-words">{lead.title}</p>

      {shown.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {shown.map((f) => (
            <ValueView key={f.id} field={f} value={lead.values[f.id]} compact />
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <p title={`Missing: ${missing.join(", ")}`} className="flex items-center gap-1 text-[11.5px] text-amber-300/90">
          <CircleAlert size={12} className="shrink-0" />
          {missing.length} {missing.length === 1 ? "detail" : "details"} missing
        </p>
      )}

      <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
        {lead.assignedTo ? (
          <>
            <Avatar name={lead.assignedTo.name} size={18} />
            <span className="min-w-0 truncate text-foreground/80">{lead.assignedTo.name.split(" ")[0]}</span>
          </>
        ) : (
          <span className="text-muted/70">Unassigned</span>
        )}
        <span title="Days since it moved into this stage" className="ml-auto shrink-0 tabular-nums">
          {days}d in stage
        </span>
      </div>
    </div>
  );
}
