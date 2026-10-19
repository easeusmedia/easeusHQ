"use client";

import { Mail, Reply, UserCheck } from "lucide-react";
import { hasChannel, leadContacts, MARKED, messagesOnDay, NO_CONTACT, PLATFORM_NAME, requestDay, type BoardData, type Contact, type LeadData, type Marked, type MarkChange } from "@/lib/space";
import { Avatar } from "../../TaskCard";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";

const ICON: Record<Marked, React.ReactNode> = {
  instagram: <InstagramIcon size={11} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={11} className="text-blue-400" />,
};
const CHIP = "chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-50";

// One lead on the board: its name, who added it, with whoever it's given to,
// and from Day 1 how it's going, per person on the lead, on every platform
// their day has a message on (`day`: its key, name and number), as the lead
// window shows them. A person with no handle for one shows nothing for it. Email shows by
// itself, once (opened and replied, how often and by whom: from the sales
// inbox and the mail tracker); Instagram and LinkedIn are tapped: on LinkedIn
// Accepted (the request taken), then Reply. Past the days (Replied, Audit
// sent…) it shows who replied where; untapping a Replied takes it back to
// its day.
export function LeadCard({
  lead,
  board,
  onOpen,
  tracks = false,
  day,
  onTrack,
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
  const many = people.length > 1;
  const idOf = (c: Contact | null) => c?.id ?? NO_CONTACT;
  const first = (name: string) => name.trim().split(/\s+/)[0];
  const who = (c: Contact | null) => (many && c?.name.trim() ? `${first(c.name)} · ` : "");
  const markOf = (c: Contact | null, p: Marked) => lead.marks[idOf(c)]?.[p] ?? {};
  const toggle = (c: Contact | null, p: Marked, kind: "accepted" | "replied") => day && onTrack?.(lead.id, { contact: idOf(c), platform: p, kind, day: markOf(c, p)[kind] ? null : day.key });
  // each person's platforms on this day, where they can be reached on them
  const channels = day?.day != null ? [...new Set(messagesOnDay(board, day.day).map((m) => m.channel))] : [];
  const rows = people.flatMap((c) => channels.filter((platform) => hasChannel(c, platform)).map((platform) => ({ c, platform })));
  const mail = rows.some((r) => r.platform === "email");
  const tapped = rows.filter((r): r is { c: Contact | null; platform: Marked } => MARKED.includes(r.platform as Marked));
  const request = requestDay(board);
  const past = tracks && !!day && day.day == null;
  const repliedBy = past ? people.flatMap((c) => MARKED.filter((p) => markOf(c, p).replied).map((p) => ({ c, p }))) : [];

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
      {tracks && ((mail && (lead.email.sent || lead.email.bounced)) || (tapped.length > 0 && onTrack)) && (
        // its own taps, not the card's: they don't open the lead
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1 pt-0.5">
          {mail && <EmailStatus email={lead.email} />}
          {onTrack &&
            tapped.map(({ c, platform: p }) => {
              const m = markOf(c, p);
              const needs = p === "linkedin" && !m.accepted;
              return (
                <span key={`${idOf(c)}-${p}`} className="flex flex-wrap items-center gap-1">
                  {p === "linkedin" && (request === day?.day || needs) && (
                    <button type="button" aria-pressed={!!m.accepted} onClick={() => toggle(c, p, "accepted")} title={m.accepted ? "They accepted the connection request. Tap to undo." : "They accepted our connection request"} className={CHIP}>
                      {ICON[p]} <UserCheck size={11} /> {who(c)}
                      {m.accepted ? "Accepted" : "Accept"}
                    </button>
                  )}
                  {/* LinkedIn's Reply only once the request is accepted, not greyed out before */}
                  {!needs && (
                    <button type="button" aria-pressed={!!m.replied} onClick={() => toggle(c, p, "replied")} title={m.replied ? "Replied. Tap to undo." : `They replied on ${PLATFORM_NAME[p]}`} className={CHIP}>
                      {ICON[p]} <Reply size={11} /> {who(c)}
                      {m.replied ? "Replied" : "Reply"}
                    </button>
                  )}
                </span>
              );
            })}
        </div>
      )}
      {past && (lead.email.replied || repliedBy.length > 0) && (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1 pt-0.5">
          <EmailStatus email={lead.email} repliedOnly />
          {repliedBy.map(({ c, p }) => (
            <button
              key={`${idOf(c)}-${p}`}
              type="button"
              aria-pressed
              disabled={!onTrack}
              onClick={() => onTrack?.(lead.id, { contact: idOf(c), platform: p, kind: "replied", day: null })}
              title={`${c?.name.trim() || "They"} replied on ${PLATFORM_NAME[p]}. Tap to undo.`}
              className={CHIP}
            >
              {ICON[p]} <Reply size={11} /> {who(c)}Replied
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A lead's email, by itself (the sales inbox and the mail tracker): not
// emailed yet, sent, not opened yet, opened (how often), replied, bounced.
// The card's size, or the lead window's (md).
export function EmailStatus({ email, size = "sm", repliedOnly = false }: { email: LeadData["email"]; size?: "sm" | "md"; repliedOnly?: boolean }) {
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
  const replied = email.replied && chip(lit, `${email.replied.address} replied by email`, `Replied · ${email.replied.by}`);
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
          email.openedBy.length > 1 ? `Opened · ${email.openedBy.map((o) => `${o.by} ${o.opens}×`).join(", ")}` : `Opened ${email.opens}×${email.openedBy[0] ? ` · ${email.openedBy[0].by}` : ""}`
        )}
      {replied}
    </>
  );
}
