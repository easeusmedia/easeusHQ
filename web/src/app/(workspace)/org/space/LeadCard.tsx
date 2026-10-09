"use client";

import { CircleDashed, Eye, Mail, Reply } from "lucide-react";
import { MARKED, missingDetails, PLATFORM_NAME, type FieldData, type LeadData, type Marked, type MarkChange } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";

const ICON: Record<Marked, React.ReactNode> = {
  instagram: <InstagramIcon size={11} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={11} className="text-blue-400" />,
};
const PILL = "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]";
const QUIET = `${PILL} bg-white/[0.05] text-muted`;
const DONE = `${PILL} bg-emerald-400/10 text-emerald-300`;

// One lead on the board: its name, the details not added yet (quietly, as
// information, not a warning), who added it, with whoever it's given to,
// and from Day 1 how it's going on each platform. Email shows by itself
// (opened, how often, replied: from the sales inbox and the mail tracker).
// Instagram and LinkedIn are tapped: Seen and Reply for the platforms its
// day goes out on (`day`: its key, name and those platforms), and what was
// marked on the others.
export function LeadCard({
  lead,
  fields,
  onOpen,
  tracks = false,
  day,
  onTrack,
}: {
  lead: LeadData;
  fields: FieldData[];
  onOpen: (id: string) => void;
  tracks?: boolean;
  day?: { key: string; name: string; marked: Marked[] };
  onTrack?: (id: string, change: MarkChange) => void;
}) {
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
      {tracks && (
        // its own taps, not the card's: they don't open the lead
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1 pt-0.5">
          {lead.email.opens > 0 && (
            <span title="Opened, by the mail tracker" className={QUIET}>
              <Mail size={11} className="text-sky-400" /> Opened {lead.email.opens}×
            </span>
          )}
          {lead.email.replied && (
            <span title="Replied by email" className={DONE}>
              <Mail size={11} /> Replied
            </span>
          )}
          {MARKED.map((p) => {
            const m = lead.marks[p] ?? {};
            const toggle = (kind: "seen" | "replied") => onTrack?.(lead.id, { platform: p, kind, day: m[kind] ? null : day!.key });
            // its day goes out here: tap Seen and Reply
            if (onTrack && day?.marked.includes(p))
              return (
                <span key={p} className="flex items-center gap-1">
                  <button type="button" aria-pressed={!!m.seen} onClick={() => toggle("seen")} title={m.seen ? "Seen. Tap to undo." : `They saw it on ${PLATFORM_NAME[p]}`} className="chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                    {ICON[p]} <Eye size={11} /> Seen
                  </button>
                  <button type="button" aria-pressed={!!m.replied} onClick={() => toggle("replied")} title={m.replied ? "Replied. Tap to undo." : `They replied on ${PLATFORM_NAME[p]}`} className="chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                    {ICON[p]} <Reply size={11} /> {m.replied ? "Replied" : "Reply"}
                  </button>
                </span>
              );
            if (m.replied)
              return (
                <span key={p} title={`Replied on ${PLATFORM_NAME[p]}`} className={DONE}>
                  {ICON[p]} Replied
                </span>
              );
            if (m.seen)
              return (
                <span key={p} title={`Seen on ${PLATFORM_NAME[p]}`} className={QUIET}>
                  {ICON[p]} Seen
                </span>
              );
            return null;
          })}
        </div>
      )}
    </div>
  );
}
