"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, CircleChevronDown, Copy, Eye, Globe, Hash, Link2, Mail, MapPin, Pencil, Phone, Plus, Quote, SquareCheck, Tags, Trash2, Type, Users, X, type LucideIcon } from "lucide-react";
import { handleOf, isFilled, linkName, type ChannelKind, type Contact, type FieldData, type FieldKind, type LinkValue } from "@/lib/space";
import type { ChannelStats } from "@/lib/channelStats";
import { InstagramIcon, LinkedinIcon, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { CheckboxEditor, CountEditor, DateEditor, dayLabel, hrefOf, TagEditor } from "./values";

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
    // words only: "Test · Two people" is TT, not T·
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
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
      {onEdit && <EditButton editing={editing} onEdit={onEdit} label={`Edit ${title.toLowerCase()}`} />}
    </div>
  );
}
function EditButton({ editing, onEdit, label }: { editing?: boolean; onEdit: () => void; label: string }) {
  return (
    <button type="button" onClick={onEdit} aria-pressed={!!editing} aria-label={editing ? "Done" : label} className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
      {editing ? <Check size={12} /> : <Pencil size={11} />}
      {editing ? "Done" : "Edit"}
    </button>
  );
}

const PLATFORM_BADGE: Record<string, { Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  youtube: { Icon: YoutubeIcon, tone: "bg-red-500" },
  instagram: { Icon: InstagramIcon, tone: "bg-pink-500" },
  linkedin: { Icon: LinkedinIcon, tone: "bg-sky-600" },
};

// The lead's profile, in two parts, everything a list (Abhishek, 19 Oct
// 2026: "bring the previous thing where everything is in the list format"):
// - the CHANNEL: its picture and name, its numbers with their icons, then
//   its pages as rows (icon on the left, plain name, handle in grey), the
//   rest, and its latest uploads. Edit opens the channel's details as a form.
//   The working tags (opener, version, meme board) stay off it.
// - the CONTACT: the person picked on the tabs at the top (whose messages
//   show), as rows too: email addresses to copy, phone, their own pages.
//   Edit opens them as a form. The + at the top adds one, here.
export function LeadProfile({
  title,
  fields,
  values,
  person,
  channel,
  editingDetails,
  onEditDetails,
  fieldLabel,
  onSaveValue,
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
  onEditDetails: () => void;
  fieldLabel: (f: FieldData) => React.ReactNode;
  onSaveValue: (fieldId: string, v: unknown) => void;
  adding: boolean;
  onCancelAdd: () => void;
  onSavePerson: (c: Contact) => Promise<boolean>;
  onRemovePerson: (id: string) => void;
}) {
  // the person's details open as a form (theirs: switching person closes it)
  const [editing, setEditing] = useState<string | null>(null);
  const contactsField = fields.find((f) => f.kind === "contacts");
  const people = (contactsField && Array.isArray(values[contactsField.id]) ? (values[contactsField.id] as Contact[]) : []).filter((p) => p.name.trim() || p.channels.some((c) => c.value.trim()));
  const who = (person && people.find((p) => p.id === person.id)) ?? people[0] ?? null;
  const shown = fields.filter((f) => f.kind !== "contacts" && !named(f, WORKING));
  // the form has them too, last, so they can still be set
  const editable = [...shown, ...fields.filter((f) => f.kind !== "contacts" && named(f, WORKING))];
  const details = shown.filter((f) => isFilled(f.kind, values[f.id]));
  // the numbers (and where it is) side by side; links as rows; the rest after
  const tiles = details.filter((f) => numberOf(f, values[f.id]) != null || (f.kind === "select" && named(f, /^country$/i)));
  const linkFields = details.filter((f) => f.kind === "links");
  const rest = details.filter((f) => !tiles.includes(f) && !linkFields.includes(f));
  // the channel's pages: the lead's own links, each once; two with one name
  // are told apart. A person's own LinkedIn or Instagram stays with them.
  // (A link whose address isn't a web address still shows, as words.)
  const seenUrl = new Set<string>();
  const seenName = new Map<string, number>();
  const pages = linkFields
    .flatMap((f) => (values[f.id] as LinkValue[]).flatMap((l) => (l.url.trim() || l.label.trim() ? [{ href: hrefOf("other", l.url) ?? l.url.trim(), base: linkName(l.label, l.url) || l.url.trim() }] : [])))
    .filter((l) => !seenUrl.has(sameUrl(l.href)) && seenUrl.add(sameUrl(l.href)))
    .map((l) => {
      const n = (seenName.get(l.base) ?? 0) + 1;
      seenName.set(l.base, n);
      return { href: l.href, name: n > 1 ? `${l.base} · ${n}` : l.base, platform: platformOf(l.href) };
    });
  const channelUrls = new Set(pages.map((l) => sameUrl(l.href)));
  // the picked person as the tabs at the top call them (a number when two share a name)
  const whoName = (() => {
    if (!who) return "";
    const base = (p: Contact) => (p.name.trim() || title).toLowerCase();
    const n = people.slice(0, people.indexOf(who) + 1).filter((p) => base(p) === base(who)).length;
    return n > 1 ? `${who.name.trim() || title} · ${n}` : who.name.trim() || title;
  })();
  const recent = (channel?.stats?.recent ?? []).filter((r) => r.views != null);
  // the channel's pictures, its YouTube one first
  const stats = channel?.stats;
  const faces = Object.entries(stats?.avatars ?? {})
    .filter((e): e is [string, string] => !!e[1])
    .sort(([a], [b]) => (b === "youtube" ? 1 : 0) - (a === "youtube" ? 1 : 0));
  if (!faces.length && stats?.avatar) faces.push([stats.platform, stats.avatar]);
  const SECTION = "px-5 py-5";
  const editingWho = !!who && editing === who.id;

  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {/* the channel */}
      <section className={SECTION}>
        <Head title="Channel" editing={editingDetails} onEdit={editable.length ? onEditDetails : undefined} />
        <div className="mb-5 flex min-w-0 items-center gap-3">
          <Pictures faces={faces} name={title} />
          <p className="min-w-0 text-sm leading-snug font-semibold break-words text-foreground">{title}</p>
        </div>
        {editingDetails ? (
          <DetailsForm fields={editable} values={values} label={fieldLabel} onSave={onSaveValue} />
        ) : (
          (tiles.length > 0 || pages.length > 0 || rest.length > 0) && (
            <div className="flex flex-col gap-5">
              {tiles.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  {tiles.map((f) => {
                    const { Icon, tone } = iconOf(f);
                    return (
                      <div key={f.id} className="flex min-w-0 items-center gap-2.5">
                        <span className={`${CIRCLE} ${tone}`}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight text-foreground tabular-nums">{numberOf(f, values[f.id]) ?? tagNames(f, values[f.id]).join(", ")}</span>
                          <span className="block truncate text-xs text-muted">{f.name}</span>
                          {f.kind === "count" && (values[f.id] as { remark?: string }).remark?.trim() && <span className="mt-0.5 block text-xs text-foreground/75">{(values[f.id] as { remark: string }).remark.trim()}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {pages.length > 0 && (
                <div className="-my-1 flex flex-col">
                  {pages.map((l, i) => (
                    <LinkRow key={i} href={l.href} name={l.name} sub={handleOf(l.href)} platform={l.platform} />
                  ))}
                </div>
              )}
              {rest.map((f) => {
                const { Icon, tone } = iconOf(f);
                return (
                  <div key={f.id} className="flex min-w-0 gap-2.5">
                    <span className={`${CIRCLE} ${tone}`}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1 pt-px">
                      <p className="text-xs text-muted">{f.name}</p>
                      <div className="mt-0.5 min-w-0 text-[13px] text-foreground/90">
                        <DetailValue field={f} value={values[f.id]} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        {/* its latest uploads, part of the channel */}
        {!editingDetails && (channel?.reading || recent.length > 0) && (
          <div className="mt-6">
            <p className={`${LABEL} mb-3`}>Latest {channel?.stats?.platform === "instagram" ? "reels" : "videos"}</p>
            <ChannelView channel={channel!.stats} at={channel!.at} reading={channel!.reading} />
          </div>
        )}
      </section>

      {/* the contact: the person picked on the tabs, or the one the + is adding */}
      {adding ? (
        <section className={SECTION}>
          <Head title="New contact" />
          <ContactForm key="new" initial={null} onSave={onSavePerson} onCancel={onCancelAdd} />
        </section>
      ) : (
        who && (
          <section className={SECTION}>
            <Head title="Contact" editing={editingWho} onEdit={() => setEditing(editingWho ? null : who.id)} />
            {editingWho ? (
              <ContactForm
                key={who.id}
                initial={who}
                onSave={async (c) => {
                  if (await onSavePerson(c)) setEditing(null);
                }}
                onCancel={() => setEditing(null)}
                onRemove={() => {
                  onRemovePerson(who.id);
                  setEditing(null);
                }}
              />
            ) : (
              <div key={who.id} className="fade-in">
                {/* their name when it says more than the channel's does */}
                <PersonBlock person={who} name={whoName} named={whoName.toLowerCase() !== title.toLowerCase() || !!who.role} channelUrls={channelUrls} />
              </div>
            )}
          </section>
        )
      )}
    </div>
  );
}

// the channel's pictures, overlapping, each with its platform's badge; else its initials
function Pictures({ faces, name }: { faces: [string, string][]; name: string }) {
  if (!faces.length) return <Face src={null} name={name} size={44} />;
  return (
    <div className="flex shrink-0 -space-x-3">
      {faces.slice(0, 3).map(([platform, src]) => {
        const badge = PLATFORM_BADGE[platform];
        return (
          <span key={platform} className="relative block" title={`${HANDLE[platform as ChannelKind]?.name ?? platform} picture`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a small picture saved with the lead's channel read */}
            <img src={src} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover ring-2 ring-black/40" />
            {badge && (
              <span className={`absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full text-white ring-2 ring-black/40 ${badge.tone}`}>
                <badge.Icon size={9} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// a person's pages (not their email addresses or phone), each with its address
const PAGE_ORDER: ChannelKind[] = ["youtube", "instagram", "linkedin", "x", "other"];
function pagesOf(c: Contact): { kind: ChannelKind; href: string; name: string }[] {
  return c.channels
    .filter((ch) => ch.kind !== "email" && ch.kind !== "phone" && ch.value.trim())
    .sort((a, b) => PAGE_ORDER.indexOf(a.kind) - PAGE_ORDER.indexOf(b.kind))
    .flatMap((ch) => {
      const href = hrefOf(ch.kind, ch.value);
      return href ? [{ kind: ch.kind, href, name: ch.kind === "other" ? linkName("", href) : (HANDLE[ch.kind]?.name ?? "Link") }] : [];
    });
}

// the working tags that drive the sequence, not anything to read when writing
const WORKING = /^(opener|version|meme board)$/i;
const CIRCLE = "grid size-8 shrink-0 place-items-center rounded-full";
// a detail's icon by what it is, else by its kind
const FIELD_ICON: [RegExp, LucideIcon, string][] = [
  [/subscriber|follower|fans|audience/i, Users, "bg-sky-400/10 text-sky-300"],
  [/view|plays|reach/i, Eye, "bg-violet-400/10 text-violet-300"],
  [/country|city|location|region/i, MapPin, "bg-emerald-400/10 text-emerald-300"],
  [/^bio$|about/i, Quote, "bg-white/[0.06] text-foreground/70"],
  [/to check/i, AlertTriangle, "bg-amber-400/10 text-amber-300"],
];
const KIND_ICON: Record<FieldKind, LucideIcon> = { select: CircleChevronDown, multi: Tags, count: Hash, contacts: Users, links: Link2, checkbox: SquareCheck, date: CalendarDays, text: Type };
function iconOf(f: FieldData): { Icon: LucideIcon; tone: string } {
  const hit = FIELD_ICON.find(([re]) => re.test(f.name));
  return hit ? { Icon: hit[1], tone: hit[2] } : { Icon: KIND_ICON[f.kind], tone: "bg-white/[0.06] text-foreground/70" };
}

// a page's platform, from its address
type Platform = "youtube" | "instagram" | "linkedin" | "x" | "notion" | "phone" | "email" | "other";
function platformOf(url: string): Platform {
  if (/^mailto:/i.test(url)) return "email";
  if (/^tel:/i.test(url)) return "phone";
  const host = /^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? "";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)notion\.(so|site)$/.test(host)) return "notion";
  return "other";
}
const sameUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");
const PLATFORM_TONE: Record<Platform, string> = {
  youtube: "bg-red-500/10 text-red-400",
  instagram: "bg-pink-500/10 text-pink-400",
  linkedin: "bg-sky-500/10 text-sky-400",
  x: "bg-white/[0.06] text-foreground/80",
  notion: "bg-white/[0.06]",
  phone: "bg-emerald-400/10 text-emerald-300",
  email: "bg-sky-400/10 text-sky-300",
  other: "bg-white/[0.06] text-foreground/70",
};
// a platform's icon in a soft circle (the details form's links)
function PlatformIcon({ platform, size = 14 }: { platform: Platform; size?: number }) {
  return (
    <span className={`${CIRCLE} ${PLATFORM_TONE[platform]}`}>
      <ChipIcon platform={platform} size={size} />
    </span>
  );
}
// a platform's icon on its own, in its colour
const ICON_TONE: Record<Platform, string> = { youtube: "text-red-400", instagram: "text-pink-400", linkedin: "text-sky-400", x: "text-foreground/80", notion: "", phone: "text-emerald-300", email: "text-sky-300", other: "text-muted" };
function ChipIcon({ platform, size = 13 }: { platform: Platform; size?: number }) {
  if (platform === "notion") return <span className="grid shrink-0 place-items-center rounded-[3px] bg-white font-bold text-black" style={{ width: size + 1, height: size + 1, fontSize: size * 0.7 }}>N</span>;
  const Icon = { youtube: YoutubeIcon, instagram: InstagramIcon, linkedin: LinkedinIcon, x: XIcon, phone: Phone, email: Mail, other: Globe }[platform];
  return <Icon size={size} className={`shrink-0 ${ICON_TONE[platform]}`} />;
}

// a page as a row: its icon on the left in a soft circle, its plain name, the
// handle it's known by in grey, an arrow on hover (words alone when the
// address isn't a web address)
const CHIP = "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground/85";
const ROW = "group/link -mx-1.5 flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-[13px] text-foreground/85";
function LinkRow({ href, name, sub, platform }: { href: string; name: string; sub?: string | null; platform: Platform }) {
  const inner = (
    <>
      <PlatformIcon platform={platform} />
      <span className="min-w-0 flex-1 truncate">
        {name}
        {sub && sub !== name && <span className="ml-2 text-xs text-muted">{sub}</span>}
      </span>
    </>
  );
  if (!/^(https?:|mailto:|tel:)/i.test(href)) return <span className={ROW}>{inner}</span>;
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={`${ROW} transition-colors hover:bg-white/[0.04] hover:text-foreground`}>
      {inner}
      <ArrowUpRight size={13} className="shrink-0 text-muted opacity-0 transition-opacity group-hover/link:opacity-100" />
    </a>
  );
}

// The person picked on the tabs: their initials, name and role (when it says
// more than the channel's name), then everything about them as rows: email
// addresses (to copy), phone, their own pages (the channel's are above)
function PersonBlock({ person, name, named, channelUrls }: { person: Contact; name: string; named: boolean; channelUrls: Set<string> }) {
  const emails = person.channels.filter((c) => c.kind === "email" && c.value.trim());
  const phones = person.channels.filter((c) => c.kind === "phone" && c.value.trim()).flatMap((c) => { const href = hrefOf("phone", c.value); return href ? [{ href, name: c.value.trim() }] : []; });
  const pages = pagesOf(person).filter((p) => !channelUrls.has(sameUrl(p.href)));
  const rows = emails.length + phones.length + pages.length;
  return (
    <div className="flex flex-col gap-4">
      {named && (
        <div className="flex min-w-0 items-center gap-3">
          <Face src={null} name={name} size={36} />
          <p className="min-w-0 text-sm leading-snug font-medium break-words text-foreground">
            {name}
            {person.role && <span className="block text-xs font-normal text-muted">{person.role}</span>}
          </p>
        </div>
      )}
      {rows > 0 && (
        <div className="-my-1 flex flex-col">
          {emails.map((c, i) => (
            <div key={i} className={`${ROW} transition-colors hover:bg-white/[0.04]`}>
              <PlatformIcon platform="email" />
              <a href={`mailto:${c.value.trim()}`} className="min-w-0 flex-1 truncate hover:text-foreground">
                {c.value.trim()}
              </a>
              <CopyButton text={c.value.trim()} className="opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" />
            </div>
          ))}
          {phones.map((p, i) => (
            <LinkRow key={`tel-${i}`} href={p.href} name={p.name} platform="phone" />
          ))}
          {pages.map((p, i) => (
            <LinkRow key={i} href={p.href} name={p.name} sub={handleOf(p.href)} platform={p.kind === "other" ? platformOf(p.href) : (p.kind as Platform)} />
          ))}
        </div>
      )}
    </div>
  );
}

// A detail's value in words: a list to check as warning lines, choices by name
function DetailValue({ field, value }: { field: FieldData; value: unknown }) {
  if (named(field, /^to check$/i)) {
    const lines = field.kind === "text" ? String(value).split("\n").filter((x) => x.trim()) : tagNames(field, value);
    return (
      <span className="flex flex-col gap-0.5 text-amber-200/90">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </span>
    );
  }
  if (field.kind === "select" || field.kind === "multi") return <>{tagNames(field, value).map(plainOption).join(", ")}</>;
  if (field.kind === "checkbox") return <>Yes</>;
  if (field.kind === "count") return <>{String((value as { n: number | null }).n ?? "")}</>;
  if (field.kind === "date" && typeof value === "string") return <>{dayLabel(value)}</>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}
// a choice without its code ("D1 · Old hit still on top": "Old hit still on top")
const plainOption = (name: string) => name.replace(/^\w\d?\s*·\s*/, "");

// The details as a form (Edit on Details): each with its icon and name above
// a plain box. Words save on leaving the box (Enter leaves it), choices save
// on a tap, and each link is its name over its address.
function DetailsForm({ fields, values, label, onSave }: { fields: FieldData[]; values: Record<string, unknown>; label: (f: FieldData) => React.ReactNode; onSave: (fieldId: string, v: unknown) => void }) {
  return (
    <div className="fade-in flex flex-col gap-5">
      {fields.map((f) => {
        const { Icon, tone } = iconOf(f);
        return (
          <div key={f.id} className="flex min-w-0 flex-col gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ${tone}`}>
                <Icon size={11} />
              </span>
              <span className="flex min-w-0">{label(f)}</span>
            </span>
            <FieldInput field={f} value={values[f.id]} save={(v) => onSave(f.id, v)} />
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ field, value, save }: { field: FieldData; value: unknown; save: (v: unknown) => void }) {
  switch (field.kind) {
    case "text":
      return <WordsInput value={value} save={save} />;
    case "select":
    case "multi":
      return <ChoiceInput field={field} value={value} save={save} />;
    case "links":
      return <LinksInput value={value} save={save} />;
    case "count":
      return <CountEditor value={value} save={save} />;
    case "checkbox":
      return <CheckboxEditor field={field} value={value} save={save} />;
    case "date":
      return <DateEditor value={value} save={save} />;
    default:
      return null;
  }
}

function WordsInput({ value, save }: { value: unknown; save: (v: string | null) => void }) {
  const saved = typeof value === "string" ? value : "";
  const [text, setText] = useState(saved);
  return (
    <textarea
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== saved.trim() && save(text.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="Empty"
      className={`${FORM_INPUT} field-sizing-content resize-none`}
    />
  );
}

// one choice (or several) as pills, saved on a tap; a tap on the one picked
// clears it. The + opens the tag list, to find or create one (and, for whoever
// sets the app up, rename or delete them).
function ChoiceInput({ field, value, save }: { field: FieldData; value: unknown; save: (v: string[] | null) => void }) {
  const on = Array.isArray(value) ? (value as string[]) : [];
  function toggle(id: string) {
    const next = on.includes(id) ? on.filter((x) => x !== id) : field.kind === "select" ? [id] : [...on, id];
    save(next.length ? next : null);
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {field.options.map((o) => (
        <button key={o.id} type="button" aria-pressed={on.includes(o.id)} onClick={() => toggle(o.id)} className="chip rounded-full px-3 py-1 text-xs">
          {plainOption(o.name)}
        </button>
      ))}
      <TagEditor field={field} value={value} save={save} trigger={{ button: <Plus size={13} />, label: `Add to ${field.name}`, className: "chip grid size-7 place-items-center rounded-full" }} />
    </div>
  );
}

// each link: its icon, then its name over its address in one box, and a
// remove. The name shows short ("YouTube"), but what's stored stays as it is
// until it's typed over (the channel read finds "YouTube channel" by name).
type LinkRowState = LinkValue & { typed: string | null };
const rowsOf = (v: unknown): LinkRowState[] => (Array.isArray(v) ? (v as LinkValue[]) : []).map((l) => ({ label: l.label, url: l.url, typed: null }));
const keptLinks = (ls: LinkRowState[]) => ls.map((l) => ({ label: (l.typed ?? l.label).trim(), url: l.url.trim() })).filter((l) => l.url || l.label);
function LinksInput({ value, save }: { value: unknown; save: (v: LinkValue[] | null) => void }) {
  const [links, setLinks] = useState(() => rowsOf(value));
  const [focus, setFocus] = useState<number | null>(null);
  const [last, setLast] = useState(() => JSON.stringify(keptLinks(rowsOf(value))));
  // a save that failed (or a change from elsewhere) puts back what's stored
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const now = JSON.stringify(keptLinks(rowsOf(value)));
    if (now !== last) {
      setLinks(rowsOf(value));
      setLast(now);
    }
  }
  function commit(next: LinkRowState[]) {
    const k = keptLinks(next);
    const s = JSON.stringify(k);
    if (s === last) return;
    setLast(s);
    save(k.length ? k : null);
  }
  const set = (i: number, patch: Partial<LinkRowState>) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-2">
      {links.map((l, i) => (
        <div key={i} className="flex min-w-0 items-center gap-2.5">
          <PlatformIcon platform={platformOf(l.url)} />
          <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02] transition-colors focus-within:border-accent/40">
            <input value={l.typed ?? (l.label.trim() ? linkName(l.label, l.url) : "")} onChange={(e) => set(i, { typed: e.target.value })} onBlur={() => commit(links)} placeholder={l.url.trim() ? linkName("", l.url) : "Name"} aria-label="Name" className="bg-transparent px-3 pt-1.5 text-[13px] text-foreground outline-none! placeholder:text-muted/60" />
            <input autoFocus={focus === i} value={l.url} onChange={(e) => set(i, { url: e.target.value })} onBlur={() => commit(links)} placeholder="https://…" aria-label="Address" className="bg-transparent px-3 pb-1.5 text-xs text-muted outline-none! placeholder:text-muted/45 focus:text-foreground/80" />
          </div>
          <button
            type="button"
            onClick={() => {
              const next = links.filter((_, j) => j !== i);
              setLinks(next);
              commit(next);
            }}
            aria-label="Remove this link"
            title="Remove"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-rose-300"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setFocus(links.length);
          setLinks([...links, { label: "", url: "", typed: null }]);
        }}
        className="flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
      >
        <Plus size={13} /> Add link
      </button>
    </div>
  );
}

// A person's details as a form: their name and role, their email addresses
// (one a line), and their pages and phone, one box each. For the + at the
// top of the window (a new contact) and for a person's own Edit (with
// Remove). Anything more they have (a second LinkedIn, a second phone) is
// listed under the boxes, each with its own remove, so nothing is out of reach.
const FORM_INPUT = "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-foreground outline-none! transition-colors placeholder:text-muted/50 focus:border-accent/40";
const HANDLE_KINDS: { kind: ChannelKind; label: string; hint: string }[] = [
  { kind: "linkedin", label: "LinkedIn", hint: "linkedin.com/in/…" },
  { kind: "instagram", label: "Instagram", hint: "instagram.com/… or @handle" },
  { kind: "youtube", label: "YouTube", hint: "youtube.com/@…" },
  { kind: "x", label: "X", hint: "x.com/… or @handle" },
  { kind: "other", label: "Website", hint: "their site" },
  { kind: "phone", label: "Phone", hint: "+44 …" },
];
export function ContactForm({ initial, onSave, onCancel, onRemove }: { initial: Contact | null; onSave: (c: Contact) => unknown; onCancel: () => void; onRemove?: () => void }) {
  const channels = initial?.channels ?? [];
  const firstOf = (kind: ChannelKind) => channels.find((c) => c.kind === kind && c.value.trim());
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [emails, setEmails] = useState(channels.filter((c) => c.kind === "email").map((c) => c.value).join("\n"));
  const [handles, setHandles] = useState<Record<string, string>>(() => Object.fromEntries(HANDLE_KINDS.map((h) => [h.kind, firstOf(h.kind)?.value ?? ""])));
  // the rest: every page or phone beyond the first of its kind
  const [more, setMore] = useState(() => channels.filter((c) => c.kind !== "email" && c.value.trim() && c !== firstOf(c.kind)));
  const [busy, setBusy] = useState(false);
  const filled = !!(name.trim() || role.trim() || emails.trim() || Object.values(handles).some((v) => v.trim()) || more.length);
  async function save() {
    const next = [
      ...emails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean).map((value) => ({ kind: "email" as ChannelKind, value })),
      ...HANDLE_KINDS.filter((h) => handles[h.kind]?.trim()).map((h) => ({ kind: h.kind, value: handles[h.kind].trim() })),
      ...more,
    ];
    setBusy(true);
    await onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), role: role.trim(), channels: next });
    setBusy(false);
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
      {more.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {more.map((c, i) => (
            <span key={i} className={`${CHIP} pr-1`}>
              <ChipIcon platform={c.kind === "phone" ? "phone" : c.kind === "other" ? platformOf(hrefOf("other", c.value) ?? c.value) : (c.kind as Platform)} />
              <span className="truncate">{c.value}</span>
              <button type="button" onClick={() => setMore((m) => m.filter((x) => x !== c))} aria-label={`Remove ${c.value}`} title="Remove" className="grid size-5 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-white/[0.08] hover:text-rose-300">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove this contact" title="Remove this contact" className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:text-red-400">
            <Trash2 size={14} />
          </button>
        )}
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!filled || busy} className="btn btn-sm btn-glow">
            {busy ? "Saving…" : initial ? "Save" : "Add contact"}
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
