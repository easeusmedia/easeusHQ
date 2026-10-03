"use client";

import { CircleDashed } from "lucide-react";
import { missingDetails, type FieldData, type LeadData } from "@/lib/space";
import { Avatar } from "../../TaskCard";

// One lead on the board: its name, the details not added yet (quietly, as
// information, not a warning), and who added it, with whoever it's given to.
export function LeadCard({ lead, fields, onOpen }: { lead: LeadData; fields: FieldData[]; onOpen: (id: string) => void }) {
  const missing = missingDetails(fields, lead.values);
  const first = (name: string) => name.split(" ")[0];

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
      className="card-surface card-interactive group relative flex cursor-pointer flex-col gap-1.5 rounded-xl px-3 py-2.5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <p className="line-clamp-2 text-sm leading-snug font-medium break-words">{lead.title}</p>
      {missing.length > 0 && (
        <p title={`Not added yet: ${missing.join(", ")}`} className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted/80">
          <CircleDashed size={12} className="shrink-0" />
          <span className="truncate">To add: {missing.join(", ")}</span>
        </p>
      )}
      <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
        <Avatar name={lead.createdBy.name} size={16} />
        <span className="min-w-0 truncate" title={`Added by ${lead.createdBy.name}`}>
          {first(lead.createdBy.name)}
        </span>
        {lead.assignedTo && lead.assignedTo.id !== lead.createdBy.id && (
          <>
            <span className="text-muted/50">→</span>
            <Avatar name={lead.assignedTo.name} size={16} />
            <span className="min-w-0 truncate" title={`Assigned to ${lead.assignedTo.name}${lead.assignedByName ? ` by ${lead.assignedByName}` : ""}`}>
              {first(lead.assignedTo.name)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
