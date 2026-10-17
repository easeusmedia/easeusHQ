"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Copy, Globe, Mail, Pencil, Phone } from "lucide-react";
import { isFilled, type ChannelKind, type Contact, type FieldData, type LinkValue } from "@/lib/space";
import type { ChannelStats } from "@/lib/channelStats";
import { InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { hrefOf } from "./values";

// What's known about a lead, read at a glance (Abhishek, 17 Oct 2026: minimal,
// balanced, no boxes): who it is (their picture, name, where, and their
// pages as icons), its numbers, anything still to check, the people to write
// to with their email addresses, the channel's latest uploads, and the rest
// as quiet rows. Only what's filled shows. Editing is under the two links at
// the foot (LeadPeek).

const HANDLE: Partial<Record<ChannelKind, { Icon: React.ComponentType<{ size?: number; className?: string }>; name: string }>> = {
  youtube: { Icon: YoutubeIcon, name: "YouTube" },
  instagram: { Icon: InstagramIcon, name: "Instagram" },
  linkedin: { Icon: LinkedinIcon, name: "LinkedIn" },
  x: { Icon: XIcon, name: "X" },
  phone: { Icon: Phone, name: "Phone" },
  other: { Icon: Globe, name: "Link" },
};
const LABEL = "text-[11px] font-medium tracking-wide text-muted uppercase";
const ICON_BTN = "grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.05] text-foreground/75 transition-colors hover:bg-white/[0.1] hover:text-foreground";

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={`Copy ${text}`}
      title="Copy"
      className={`grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-[color,background-color,opacity] hover:bg-white/[0.08] hover:text-foreground ${className}`}
    >
      {done ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
    </button>
  );
}

// a picture, else the name's initials on a soft circle
function Face({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  const letters = name
    .replace(/^(dr\.?|mr\.?|ms\.?)\s+/i, "")
    .split(/[\s|/,-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small picture saved with the lead's channel read
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-linear-to-br from-sky-400/25 to-violet-400/20 font-semibold text-foreground/85 ring-1 ring-white/10" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {letters || "?"}
    </span>
  );
}

// a number read from a count, or text that is one ("20,400", "1.2K")
const NUMERIC = /^[\d][\d,.]*\s*[KkMm]?$/;
function numberOf(f: FieldData, v: unknown): string | null {
  if (f.kind === "count") {
    const n = (v as { n: number | null } | null)?.n;
    return n == null ? null : n.toLocaleString("en-GB");
  }
  return f.kind === "text" && typeof v === "string" && NUMERIC.test(v.trim()) ? v.trim() : null;
}
const named = (f: FieldData, re: RegExp) => re.test(f.name.trim());
const tagNames = (f: FieldData, v: unknown) => (Array.isArray(v) ? (v as string[]).flatMap((id) => f.options.filter((o) => o.id === id).map((o) => o.name)) : []);

// a section's small heading, with Edit (Done while editing) at its right
function Head({ title, editing, onEdit }: { title: string; editing?: boolean; onEdit?: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <p className={LABEL}>{title}</p>
      {onEdit && (
        <button type="button" onClick={onEdit} aria-pressed={!!editing} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
          {editing ? <Check size={12} /> : <Pencil size={11} />}
          {editing ? "Done" : "Edit"}
        </button>
      )}
    </div>
  );
}

const PLATFORM_BADGE: Record<string, { Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  youtube: { Icon: YoutubeIcon, tone: "bg-red-500" },
  instagram: { Icon: InstagramIcon, tone: "bg-pink-500" },
  linkedin: { Icon: LinkedinIcon, tone: "bg-sky-600" },
};

// The lead's profile, everything stacked down the panel (Abhishek, 17 Oct
// 2026): the person picked at the top of the window (their picture, name and
// role, email addresses to copy, and their pages as icons; the pencil opens
// them as a form), then every detail, its name above its value, then the
// channel's latest uploads. People are added with the + at the top.
export function LeadProfile({
  title,
  fields,
  values,
  person,
  channel,
  editingDetails,
  editingContacts,
  onEditDetails,
  onEditContacts,
  detailsEditor,
  adding,
  onCancelAdd,
  onSavePerson,
  onRemovePerson,
}: {
  title: string;
  fields: FieldData[];
  values: Record<string, unknown>;
  person: Contact | null;
  channel: { stats: ChannelStats | null; at: string | null; reading: boolean } | null;
  editingDetails: boolean;
  editingContacts: boolean;
  onEditDetails: () => void;
  onEditContacts: () => void;
  detailsEditor: React.ReactNode;
  adding: boolean;
  onCancelAdd: () => void;
  onSavePerson: (c: Contact) => void;
  onRemovePerson: (id: string) => void;
}) {
  const contactsField = fields.find((f) => f.kind === "contacts");
  const people = (contactsField && Array.isArray(values[contactsField.id]) ? (values[contactsField.id] as Contact[]) : []).filter((p) => p.name.trim() || p.channels.some((c) => c.value.trim()));
  const who = (person && people.find((p) => p.id === person.id)) ?? people[0] ?? null;
  // every detail but the people (and the meme board, shown on its own day's email)
  const details = fields.filter((f) => f.kind !== "contacts" && !named(f, /^meme board$/i) && isFilled(f.kind, values[f.id]));
  const recent = (channel?.stats?.recent ?? []).filter((r) => r.views != null);
  // the channel's pictures, one per page, go with the first person
  const stats = channel?.stats;
  const faces = Object.entries(stats?.avatars ?? {}).filter((e): e is [string, string] => !!e[1]);
  if (!faces.length && stats?.avatar) faces.push([stats.platform, stats.avatar]);
  const SECTION = "px-5 py-5";

  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {/* the person picked at the top, or the one the + is adding */}
      {adding ? (
        <section className={SECTION}>
          <Head title="New contact" />
          <ContactForm key="new" initial={null} onSave={onSavePerson} onCancel={onCancelAdd} />
        </section>
      ) : who && (
        <section className={SECTION}>
          <Head title="Contact" editing={editingContacts} onEdit={onEditContacts} />
          {editingContacts ? (
            <ContactForm
              key={who.id}
              initial={who}
              onSave={(c) => {
                onSavePerson(c);
                onEditContacts();
              }}
              onCancel={onEditContacts}
              onRemove={() => {
                onRemovePerson(who.id);
                onEditContacts();
              }}
            />
          ) : (
            <PersonBlock person={who} faces={who.id === people[0]?.id ? faces : []} lead={title} />
          )}
        </section>
      )}

      {/* every detail, its name above its value */}
      <section className={SECTION}>
        <Head title="Details" editing={editingDetails} onEdit={onEditDetails} />
        {editingDetails ? (
          <div className="fade-in">{detailsEditor}</div>
        ) : (
          <dl className="flex flex-col gap-4">
            {details.map((f) => (
              <div key={f.id} className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted">{f.name}</dt>
                <dd className="min-w-0 text-[13px] text-foreground/90">
                  <DetailValue field={f} value={values[f.id]} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* the channel's latest uploads */}
      {(channel?.reading || recent.length > 0) && (
        <section className={SECTION}>
          <Head title={`Latest ${channel?.stats?.platform === "instagram" ? "reels" : "videos"}`} />
          <ChannelView channel={channel!.stats} at={channel!.at} reading={channel!.reading} />
        </section>
      )}
    </div>
  );
}

// One person on the lead: their picture (the channel's, one per page, for the
// first person), name and role, email addresses to copy, and pages as icons
function PersonBlock({ person, faces, lead }: { person: Contact; faces: [string, string][]; lead: string }) {
  const emails = person.channels.filter((c) => c.kind === "email" && c.value.trim());
  const pages = person.channels.filter((c) => c.kind !== "email" && c.value.trim()).flatMap((c) => {
    const href = hrefOf(c.kind, c.value);
    return href ? [{ kind: c.kind, href }] : [];
  });
  const name = person.name.trim() || lead;
  return (
    <div className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
      {faces.length ? (
        <div className="flex shrink-0 -space-x-3 self-start">
          {faces.slice(0, 3).map(([platform, src]) => {
            const badge = PLATFORM_BADGE[platform];
            return (
              <span key={platform} className="relative block" title={`${platform} picture`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a small picture saved with the lead's channel read */}
                <img src={src} alt="" className="size-11 rounded-full object-cover ring-2 ring-[#16191e]" />
                {badge && (
                  <span className={`absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full text-white ring-2 ring-[#16191e] ${badge.tone}`}>
                    <badge.Icon size={9} />
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <span className="self-start">
          <Face src={null} name={name} size={44} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm leading-snug font-medium break-words text-foreground">
          {name}
          {person.role && <span className="font-normal text-muted"> · {person.role}</span>}
        </p>
        {emails.map((c, i) => (
          <div key={i} className="group/email -mx-1.5 flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-white/[0.04]">
            <Mail size={13} className="shrink-0 text-sky-400" />
            <a href={`mailto:${c.value.trim()}`} className="min-w-0 flex-1 truncate text-[13px] text-foreground/85 hover:text-foreground">
              {c.value.trim()}
            </a>
            <CopyButton text={c.value.trim()} className="opacity-0 group-hover/email:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" />
          </div>
        ))}
        {!emails.length && <p className="text-xs text-muted">No email address</p>}
        {pages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {pages.map((l, i) => (
              <a key={i} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" title={HANDLE[l.kind]?.name ?? "Link"} aria-label={HANDLE[l.kind]?.name ?? "Link"} className={ICON_BTN}>
                {l.kind === "phone" ? <Phone size={14} className="text-emerald-300" /> : <PlatformMark url={l.href} size={14} className={l.kind === "youtube" ? "text-red-400" : l.kind === "instagram" ? "text-pink-400" : l.kind === "linkedin" ? "text-sky-400" : "text-muted"} />}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A detail's value in words: links as links, a list to check as warning lines
function DetailValue({ field, value }: { field: FieldData; value: unknown }) {
  if (field.kind === "links")
    return (
      <span className="flex flex-col gap-1">
        {(value as LinkValue[])
          .filter((l) => l.url.trim())
          .map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="group/link flex min-w-0 items-center gap-2 hover:text-foreground">
              {/notion\.(site|so)/.test(l.url) ? (
                <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] bg-white text-[9px] font-bold text-black">N</span>
              ) : (
                <PlatformMark url={l.url} size={13} className="shrink-0 text-muted" />
              )}
              <span className="min-w-0 truncate">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
              <ArrowUpRight size={12} className="shrink-0 text-muted opacity-0 transition-opacity group-hover/link:opacity-100" />
            </a>
          ))}
      </span>
    );
  if (named(field, /^to check$/i)) {
    const lines = field.kind === "text" ? String(value).split("\n").filter((x) => x.trim()) : tagNames(field, value);
    return (
      <span className="flex flex-col gap-1">
        {lines.map((l, i) => (
          <span key={i} className="flex items-start gap-1.5 text-amber-200/90">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300" />
            {l}
          </span>
        ))}
      </span>
    );
  }
  const n = numberOf(field, value);
  if (n) return <span className="text-base font-semibold tracking-tight text-foreground tabular-nums">{n}</span>;
  if (field.kind === "select" || field.kind === "multi") return <>{tagNames(field, value).map((t) => t.replace(/^\w\d?\s*·\s*/, "")).join(", ")}</>;
  if (field.kind === "checkbox") return <>Yes</>;
  if (field.kind === "count") return <>{String((value as { n: number | null }).n ?? "")}</>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

// A person's details as a form: their name and role, their email addresses
// (one a line) and their pages. For the + at the top of the window (a new
// person) and for the pencil on the one picked (with Remove).
const FORM_INPUT = "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-foreground outline-none! transition-colors placeholder:text-muted/50 focus:border-accent/40";
const HANDLE_KINDS: { kind: ChannelKind; label: string; hint: string }[] = [
  { kind: "linkedin", label: "LinkedIn", hint: "linkedin.com/in/…" },
  { kind: "instagram", label: "Instagram", hint: "instagram.com/… or @handle" },
  { kind: "youtube", label: "YouTube", hint: "youtube.com/@…" },
  { kind: "phone", label: "Phone", hint: "+44 …" },
];
export function ContactForm({ initial, onSave, onCancel, onRemove }: { initial: Contact | null; onSave: (c: Contact) => void; onCancel: () => void; onRemove?: () => void }) {
  const first = (kind: ChannelKind) => initial?.channels.find((c) => c.kind === kind)?.value ?? "";
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [emails, setEmails] = useState((initial?.channels ?? []).filter((c) => c.kind === "email").map((c) => c.value).join("\n"));
  const [handles, setHandles] = useState<Record<string, string>>(() => Object.fromEntries(HANDLE_KINDS.map((h) => [h.kind, first(h.kind)])));
  function save() {
    // the ones this form doesn't show (a second LinkedIn, X, other) stay as they were
    const shown = new Set<ChannelKind>(["email", ...HANDLE_KINDS.map((h) => h.kind)]);
    const kept = (initial?.channels ?? []).filter((c) => !shown.has(c.kind) || (c.kind !== "email" && c !== initial?.channels.find((x) => x.kind === c.kind)));
    const channels = [
      ...emails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean).map((value) => ({ kind: "email" as ChannelKind, value })),
      ...HANDLE_KINDS.filter((h) => handles[h.kind]?.trim()).map((h) => ({ kind: h.kind, value: handles[h.kind].trim() })),
      ...kept,
    ];
    onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), role: role.trim(), channels });
  }
  return (
    <div className="fade-in flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={FORM_INPUT} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" aria-label="Role" className={FORM_INPUT} />
      </div>
      <textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Email addresses, one a line" aria-label="Email addresses" rows={2} className={`${FORM_INPUT} field-sizing-content resize-none`} />
      <div className="flex flex-col gap-2">
        {HANDLE_KINDS.map((h) => (
          <input key={h.kind} value={handles[h.kind] ?? ""} onChange={(e) => setHandles((x) => ({ ...x, [h.kind]: e.target.value }))} placeholder={`${h.label}: ${h.hint}`} aria-label={h.label} className={FORM_INPUT} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-300/80 transition-colors hover:text-red-300">
            Remove this person
          </button>
        )}
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!name.trim() && !emails.trim()} className="btn btn-sm btn-glow">
            {initial ? "Save" : "Add person"}
          </button>
        </span>
      </div>
    </div>
  );
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} ${months === 1 ? "month" : "months"} ago` : `${Math.floor(months / 12)} ${months < 24 ? "year" : "years"} ago`;
};
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

// The channel's latest uploads, read by Apify (lib/leadChannel.ts): when it
// last posted, and each recent video or reel as a bar of its views, so a hit
// or a dip stands out. "Reading…" while a read is under way.
export function ChannelView({ channel, at, reading }: { channel: ChannelStats | null; at: string | null; reading: boolean }) {
  const recent = (channel?.recent ?? []).filter((r) => r.views != null).slice(0, 10);
  if (!recent.length && !reading) return null;
  const max = Math.max(1, ...recent.map((r) => r.views ?? 0));
  const typical = channel?.typicalViews ?? null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs text-muted">
        {channel?.platform === "instagram" ? <InstagramIcon size={13} className="text-pink-400" /> : <YoutubeIcon size={13} className="text-red-400" />}
        {channel?.lastUploadAt && <span>Last {channel.platform === "instagram" ? "post" : "upload"} {ago(channel.lastUploadAt)}</span>}
        <span className="ml-auto">{reading ? <span className="animate-pulse">Reading…</span> : at ? `Read ${ago(at)}` : null}</span>
      </div>
      {recent.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {recent.map((r, i) => {
            const v = r.views ?? 0;
            const hit = typical != null && v >= typical * 3;
            const row = (
              <>
                <span className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate text-foreground/85">{r.title || "Untitled"}</span>
                  <span className={`shrink-0 tabular-nums ${hit ? "text-emerald-300" : "text-muted"}`}>{short(v)}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className={`block h-full rounded-full ${hit ? "bg-emerald-400/80" : "bg-accent/70"}`} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
                </span>
              </>
            );
            return (
              <li key={i}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" title={`${r.title}: ${v.toLocaleString("en-GB")} views${r.at ? `, ${ago(r.at)}` : ""}`} className="flex flex-col gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/[0.04]">
                    {row}
                  </a>
                ) : (
                  <span className="flex flex-col gap-1 px-1 py-0.5">{row}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
