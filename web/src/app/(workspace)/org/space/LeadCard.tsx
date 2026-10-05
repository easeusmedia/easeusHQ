"use client";

import { CircleDashed, MailOpen, Plus, Reply } from "lucide-react";
import { missingDetails, type FieldData, type LeadData, type Reply as ReplyRecord } from "@/lib/space";
import { Avatar } from "../../TaskCard";

export type Outreach = { opens?: number; replies?: ReplyRecord[]; replied?: boolean };

// One lead on the board: its name, the details not added yet (quietly, as
// information, not a warning), who added it, with whoever it's given to,
// and from Day 1 whether its email was opened (and how often) and whether
// it replied on the day it's on (`day`: its key and name): a tap sets each.
export function LeadCard({ lead, fields, onOpen, tracks = false, day, onTrack }: { lead: LeadData; fields: FieldData[]; onOpen: (id: string) => void; tracks?: boolean; day?: { key: string; name: string }; onTrack?: (id: string, change: Outreach) => void }) {
  const repliedToday = !!day && lead.replies.some((r) => r.key === day.key);
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
      {tracks && onTrack && (
        // its own taps, not the card's: they don't open the lead
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1 pt-0.5">
          <button
            type="button"
            aria-pressed={lead.opens > 0}
            onClick={() => onTrack(lead.id, { opens: lead.opens > 0 ? 0 : 1 })}
            title={lead.opens > 0 ? "Opened. Tap to undo." : "The email was opened"}
            className="chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
          >
            <MailOpen size={11} /> {lead.opens > 0 ? `Opened ${lead.opens}×` : "Opened"}
          </button>
          {lead.opens > 0 && (
            <button type="button" onClick={() => onTrack(lead.id, { opens: lead.opens + 1 })} aria-label="Opened once more" title="Opened once more" className="chip grid size-5 place-items-center rounded-full">
              <Plus size={10} />
            </button>
          )}
          {day && (
            <button
              type="button"
              aria-pressed={repliedToday}
              onClick={() => onTrack(lead.id, { replies: repliedToday ? lead.replies.filter((r) => r.key !== day.key) : [...lead.replies, { key: day.key, at: new Date().toISOString() }] })}
              title={repliedToday ? `Replied on ${day.name}. Tap to undo.` : `They replied on ${day.name}, anywhere`}
              className="chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            >
              <Reply size={11} /> Replied
            </button>
          )}
        </div>
      )}
    </div>
  );
}
