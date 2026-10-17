"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Copy, Globe, Mail, Phone } from "lucide-react";
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
// a link to a person's or a channel's page, not to one video or post
const isPage = (l: LinkValue) => !/video|reel|post|episode|opener/i.test(l.label);

export function LeadProfile({
  title,
  fields,
  values,
  channel,
  onEditDetails,
  onEditContacts,
}: {
  title: string;
  fields: FieldData[];
  values: Record<string, unknown>;
  channel: { stats: ChannelStats | null; at: string | null; reading: boolean } | null;
  onEditDetails: () => void;
  onEditContacts: () => void;
}) {
  const filled = fields.filter((f) => isFilled(f.kind, values[f.id]));
  const contactsField = fields.find((f) => f.kind === "contacts");
  const people = (contactsField && Array.isArray(values[contactsField.id]) ? (values[contactsField.id] as Contact[]) : []).filter((p) => p.name.trim() || p.channels.some((c) => c.value.trim()));
  // the tag the board is grouped by (Opener, Version) reads as a plain line under the name
  const group = filled.find((f) => f.kind === "select" && f.onCard);
  const country = filled.find((f) => named(f, /^country$/i));
  const sub = [country && tagNames(country, values[country.id])[0], group && tagNames(group, values[group.id])[0]?.replace(/^\w\d?\s*·\s*/, "")].filter(Boolean).join(" · ");
  const numbers = filled.flatMap((f) => {
    const n = numberOf(f, values[f.id]);
    return n ? [{ f, n }] : [];
  });
  const check = filled.find((f) => named(f, /^to check$/i));
  const checks = check ? (check.kind === "text" ? String(values[check.id]).split("\n").filter((x) => x.trim()) : tagNames(check, values[check.id])) : [];
  const links = filled.filter((f) => f.kind === "links").flatMap((f) => (values[f.id] as LinkValue[]).filter((l) => l.url.trim()));
  // every page: the board's links, then each person's handles (once each)
  const seen = new Set<string>();
  const pages = [
    ...links.filter(isPage).map((l) => ({ label: l.label || "Link", url: l.url })),
    ...people.flatMap((p) => p.channels.filter((c) => c.kind !== "email" && c.value.trim()).map((c) => ({ label: HANDLE[c.kind]?.name ?? "Link", url: hrefOf(c.kind, c.value) ?? "" }))),
  ].filter((l) => l.url && !seen.has(l.url.replace(/\/+$/, "").toLowerCase()) && seen.add(l.url.replace(/\/+$/, "").toLowerCase()));
  const others = links.filter((l) => !isPage(l));
  const bio = filled.find((f) => f.kind === "text" && named(f, /^bio$/i));
  // what's left, as quiet rows (the meme board shows on its own day's email)
  const rows = filled.filter((f) => f !== group && f !== country && f !== check && f !== bio && f.kind !== "contacts" && f.kind !== "links" && !numberOf(f, values[f.id]) && !named(f, /^meme board$/i));
  const recent = (channel?.stats?.recent ?? []).filter((r) => r.views != null);

  return (
    <div className="flex flex-col gap-7 pt-1 pb-2">
      {/* who */}
      <div className="flex items-center gap-4">
        <Face src={channel?.stats?.avatar ?? null} name={title} size={60} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-foreground">{title}</p>
          {sub && <p className="truncate text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {pages.length > 0 && (
        <div className="-mt-3 flex flex-wrap gap-1.5">
          {pages.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" title={l.label} aria-label={l.label} className={ICON_BTN}>
              {/notion\.(site|so)/.test(l.url) ? (
                <span className="grid size-3.5 place-items-center rounded-[3px] bg-white text-[9px] font-bold text-black">N</span>
              ) : l.url.startsWith("tel:") ? (
                <Phone size={14} />
              ) : (
                <PlatformMark url={l.url} size={14} />
              )}
            </a>
          ))}
        </div>
      )}

      {/* its numbers */}
      {numbers.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {numbers.map(({ f, n }) => (
            <div key={f.id} className="min-w-0">
              <p className="text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums">{n}</p>
              <p className="mt-1.5 truncate text-xs text-muted">{f.name}</p>
            </div>
          ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="flex flex-col gap-1.5 border-l-2 border-amber-400/60 pl-3">
          {checks.map((c, i) => (
            <p key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300" />
              {c}
            </p>
          ))}
        </div>
      )}

      {/* who to write to */}
      {people.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className={LABEL}>{people.length > 1 ? "People" : "Email"}</p>
          {people.map((p) => {
            const emails = p.channels.filter((c) => c.kind === "email" && c.value.trim());
            return (
              <div key={p.id} className="flex flex-col gap-0.5">
                {(people.length > 1 || (p.name.trim() && p.name.trim() !== title)) && (
                  <p className="pb-1 text-[13px] font-medium text-foreground/90">
                    {p.name.trim() || "No name"}
                    {p.role && <span className="font-normal text-muted"> · {p.role}</span>}
                  </p>
                )}
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
              </div>
            );
          })}
        </div>
      )}

      {/* what the opener is about, and anything else to open */}
      {others.length > 0 && (
        <div className="flex flex-col gap-1">
          {others.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="group/link flex items-center gap-2 py-0.5 text-[13px] text-foreground/85 hover:text-foreground">
              <PlatformMark url={l.url} size={13} className="text-muted" />
              <span className="min-w-0 truncate">{l.label || l.url}</span>
              <ArrowUpRight size={12} className="shrink-0 text-muted opacity-0 transition-opacity group-hover/link:opacity-100" />
            </a>
          ))}
        </div>
      )}

      {bio && <p className="border-l-2 border-white/10 pl-3 text-[13px] leading-relaxed text-foreground/75 italic">{String(values[bio.id])}</p>}

      {/* the channel's latest uploads */}
      {(channel?.reading || recent.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className={LABEL}>Latest {channel?.stats?.platform === "instagram" ? "reels" : "videos"}</p>
          <ChannelView channel={channel!.stats} at={channel!.at} reading={channel!.reading} />
        </div>
      )}

      {rows.length > 0 && (
        <dl className="flex flex-col">
          {rows.map((f) => (
            <div key={f.id} className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-2 text-[13px] last:border-b-0">
              <dt className="shrink-0 text-muted">{f.name}</dt>
              <dd className="min-w-0 text-right text-foreground/85">
                {f.kind === "select" || f.kind === "multi" ? tagNames(f, values[f.id]).join(", ") : f.kind === "checkbox" ? "Yes" : f.kind === "count" ? String((values[f.id] as { n: number | null }).n ?? "") : String(values[f.id])}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex gap-4 text-xs">
        <button type="button" onClick={onEditDetails} className="text-muted transition-colors hover:text-foreground">
          Edit details
        </button>
        <button type="button" onClick={onEditContacts} className="text-muted transition-colors hover:text-foreground">
          Edit contacts
        </button>
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
