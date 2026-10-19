"use client";

import { Mail } from "lucide-react";
import { leadContacts, MARKED, NO_CONTACT, PLATFORM_NAME, type BoardData, type Contact, type LeadData, type Marked, type MarkChange } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";

const ICON: Record<Marked, React.ReactNode> = {
  instagram: <InstagramIcon size={11} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={11} className="text-blue-400" />,
};

// One lead on the board: its name, who added it, with whoever it's given to,
// and from Day 1 how it's going, as a status only: email (opened, replied,
// bounced: from the sales inbox and the mail tracker) and, for Instagram and
// LinkedIn, the furthest thing that happened (replied, seen, accepted). No
// names and nothing to tap here: who did what, and the taps, are inside the
// lead, on each message (Abhishek, 19 Oct 2026). `day` and `onTrack` are
// still passed by the board but no longer used here.
export function LeadCard({
  lead,
  board,
  onOpen,
  tracks = false,
}: {
  lead: LeadData;
  board: Pick<BoardData, "stages" | "messages" | "fields">;
  onOpen: (id: string) => void;
  tracks?: boolean;
  day?: { key: string; name: string; day: number | null };
  onTrack?: (id: string, change: MarkChange) => void;
}) {
  const contacts = leadContacts(lead.values, board.fields);
  const people: (Contact | null)[] = contacts.length ? contacts : [null];
  const idOf = (c: Contact | null) => c?.id ?? NO_CONTACT;
  const first = (name: string) => name.trim().split(/\s+/)[0];
  // how it's going on Instagram and LinkedIn, all its people together: the
  // furthest thing that happened (replied, seen, accepted), no names and
  // nothing to tap (Abhishek, 19 Oct 2026: who accepted, and the taps, are
  // inside the lead, on each message)
  const statusOf = (p: Marked) => {
    const ms = people.map((c) => lead.marks[idOf(c)]?.[p] ?? {});
    return ms.some((m) => m.replied) ? "Replied" : ms.some((m) => m.seen) ? "Seen" : ms.some((m) => m.accepted) ? "Accepted" : null;
  };
  const statuses = tracks ? MARKED.flatMap((p) => { const s = statusOf(p); return s ? [{ p, s }] : []; }) : [];
  const mail = tracks && (lead.email.sent || lead.email.bounced || !!lead.email.replied);

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
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
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
      {(mail || statuses.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {mail && <EmailStatus email={lead.email} named={false} />}
          {statuses.map(({ p, s: status }) => (
            <span key={p} title={`${status} on ${PLATFORM_NAME[p]}`} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${status === "Replied" || status === "Seen" ? "chip-lit border" : "chip"}`}>
              {ICON[p]} {status}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// A lead's email, by itself (the sales inbox and the mail tracker): not
// emailed yet, sent, not opened yet, opened (how often), replied, bounced.
// The card's size, or the lead window's (md).
export function EmailStatus({ email, size = "sm", repliedOnly = false, named = true }: { email: LeadData["email"]; size?: "sm" | "md"; repliedOnly?: boolean; named?: boolean }) {
  // opened and replied light up as the pressed Seen and Replied do
  const lit = "chip-lit border";
  const box = size === "sm" ? "gap-1 px-2 py-0.5 text-[12px]" : "gap-1.5 px-3 py-1 text-xs";
  const chip = (tone: string, title: string, text: string) => (
    <span title={title} className={`flex w-fit max-w-full min-w-0 items-center rounded-full ${box} ${tone}`}>
      {/* the email icon in its own blue when lit, as Seen and Replied carry their platform's */}
      <Mail size={size === "sm" ? 11 : 12} className={`shrink-0 ${tone === lit ? "text-sky-400" : ""}`} /> <span className="truncate">{text}</span>
    </span>
  );
  // who wrote back, when a lead has more than one contact
  const replied = email.replied && chip(lit, `${email.replied.address} replied by email`, named ? `Replied · ${email.replied.by}` : "Replied");
  if (repliedOnly) return replied || null;
  if (email.bounced) return chip("bg-rose-400/10 text-rose-300", "The email didn't reach them", "Bounced");
  // email goes out by itself, so only what happened shows: no grey "Not
  // emailed yet", "Not opened yet" or "Sent" (17 Oct 2026)
  if (!email.sent) return null;
  return (
    <>
      {email.opens > 0 &&
        chip(
          lit,
          email.openedBy.map((o) => `${o.address} opened it ${o.opens}×`).join("\n") || "Opened, by the mail tracker",
          // who opened it: one person "Opened 2× · Akash Raj", more "Opened · Akash Raj 2×, Rohan Mehra 1×"
          !named ? `Opened ${email.opens}×` : email.openedBy.length > 1 ? `Opened · ${email.openedBy.map((o) => `${o.by} ${o.opens}×`).join(", ")}` : `Opened ${email.opens}×${email.openedBy[0] ? ` · ${email.openedBy[0].by}` : ""}`
        )}
      {replied}
    </>
  );
}
