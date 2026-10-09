"use client";

import { Mail, Reply } from "lucide-react";
import { MARKED, missingDetails, PLATFORM_NAME, type FieldData, type LeadData, type Marked, type MarkChange } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";

const ICON: Record<Marked, React.ReactNode> = {
  instagram: <InstagramIcon size={11} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={11} className="text-blue-400" />,
};

// One lead on the board: its name, the details not added yet (quietly, as
// information, not a warning), who added it, with whoever it's given to,
// and from Day 1 how it's going on the platform its day's message goes out
// on (`day`: its key, name and platform), only that one. Email shows by
// itself (opened and replied, how often and by whom: from the sales inbox and
// the mail tracker); Instagram and LinkedIn are tapped, Reply only.
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
  day?: { key: string; name: string; platform: string | null };
  onTrack?: (id: string, change: MarkChange) => void;
}) {
  const missing = missingDetails(fields, lead.values);
  // the platform its day goes out on: email shows by itself, the others are tapped
  const mail = day?.platform === "email";
  const marked = MARKED.find((p) => p === day?.platform);
  const m = (marked && lead.marks[marked]) || {};
  const toggle = (kind: "seen" | "replied") => marked && day && onTrack?.(lead.id, { platform: marked, kind, day: m[kind] ? null : day.key });
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
        <p title={`Not added yet: ${missing.join(", ")}`} className="truncate text-[11.5px] text-muted/80">
          To add: {missing.join(", ")}
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
      {tracks && (mail || (marked && onTrack)) && (
        // its own taps, not the card's: they don't open the lead
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1 pt-0.5">
          {mail && <EmailStatus email={lead.email} />}
          {marked && onTrack && (
            <>
              <button type="button" aria-pressed={!!m.replied} onClick={() => toggle("replied")} title={m.replied ? "Replied. Tap to undo." : `They replied on ${PLATFORM_NAME[marked]}`} className="chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                {ICON[marked]} <Reply size={11} /> {m.replied ? "Replied" : "Reply"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A lead's email, by itself (the sales inbox and the mail tracker): not
// emailed yet, sent, not opened yet, opened (how often), replied, bounced.
// The card's size, or the lead window's (md).
export function EmailStatus({ email, size = "sm" }: { email: LeadData["email"]; size?: "sm" | "md" }) {
  const quiet = "bg-white/[0.05] text-muted";
  // opened and replied light up as the pressed Seen and Replied do
  const lit = "chip-lit border";
  const box = size === "sm" ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-3 py-1 text-xs";
  const chip = (tone: string, title: string, text: string) => (
    <span title={title} className={`flex w-fit max-w-full min-w-0 items-center rounded-full ${box} ${tone}`}>
      {/* the email icon in its own blue when lit, as Seen and Replied carry their platform's */}
      <Mail size={size === "sm" ? 11 : 12} className={`shrink-0 ${tone === lit ? "text-sky-400" : ""}`} /> <span className="truncate">{text}</span>
    </span>
  );
  if (email.bounced) return chip("bg-rose-400/10 text-rose-300", "The email didn't reach them", "Bounced");
  if (!email.sent) return chip(quiet, "No email has gone to them from the sales inbox yet", "Not emailed yet");
  return (
    <>
      {email.opens > 0
        ? chip(
            lit,
            email.openedBy.map((o) => `${o.address} opened it ${o.opens}×`).join("\n") || "Opened, by the mail tracker",
            // who opened it: one person "Opened 2× · Akash Raj", more "Opened · Akash Raj 2×, Rohan Mehra 1×"
            email.openedBy.length > 1 ? `Opened · ${email.openedBy.map((o) => `${o.by} ${o.opens}×`).join(", ")}` : `Opened ${email.opens}×${email.openedBy[0] ? ` · ${email.openedBy[0].by}` : ""}`
          )
        : email.tracked
          ? chip(quiet, "Sent with the mail tracker, not opened yet", "Not opened yet")
          : !email.replied && chip(quiet, "Sent without the mail tracker, so opens aren't known", "Sent")}
      {/* who wrote back, when a lead has more than one contact */}
      {email.replied && chip(lit, `${email.replied.address} replied by email`, `Replied · ${email.replied.by}`)}
    </>
  );
}
