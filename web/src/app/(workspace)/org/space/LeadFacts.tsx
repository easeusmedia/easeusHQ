"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Globe, Mail, Phone } from "lucide-react";
import { isFilled, type ChannelKind, type Contact, type FieldData, type LinkValue } from "@/lib/space";
import { InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { hrefOf } from "./values";
import { TagPill } from "./pills";

// What's known about a lead, read at a glance rather than as rows of text
// (Abhishek, 17 Oct 2026): each person with their email addresses first,
// to copy, and their other handles as buttons; then its numbers as tiles,
// its tags as chips under their names, its links as buttons named for what
// they are, and anything still to check as a callout.

const SOCIAL: Partial<Record<ChannelKind, { Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string; name: string }>> = {
  linkedin: { Icon: LinkedinIcon, tone: "text-blue-400", name: "LinkedIn" },
  instagram: { Icon: InstagramIcon, tone: "text-pink-400", name: "Instagram" },
  youtube: { Icon: YoutubeIcon, tone: "text-red-400", name: "YouTube" },
  x: { Icon: XIcon, tone: "text-foreground", name: "X" },
  phone: { Icon: Phone, tone: "text-emerald-300", name: "Phone" },
  other: { Icon: Globe, tone: "text-muted", name: "Link" },
};
const LABEL = "px-0.5 text-[11px] font-medium tracking-wide text-muted uppercase";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={label}
      title={label}
      className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground"
    >
      {done ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
    </button>
  );
}

// The people on a lead: name and role, every email address with a copy
// button, and their other handles as buttons along the bottom
export function PeopleCards({ value }: { value: unknown }) {
  const people = (Array.isArray(value) ? (value as Contact[]) : []).filter((p) => p.name.trim() || p.channels.some((c) => c.value.trim()));
  if (!people.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {people.map((p) => {
        const emails = p.channels.filter((c) => c.kind === "email" && c.value.trim());
        const others = p.channels.filter((c) => c.kind !== "email" && c.value.trim());
        return (
          <div key={p.id} className="panel-soft flex min-w-0 flex-col gap-2 rounded-xl px-3.5 py-3">
            <p className="truncate text-sm font-medium text-foreground">
              {p.name.trim() || "No name"}
              {p.role && <span className="font-normal text-muted"> · {p.role}</span>}
            </p>
            {emails.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {emails.map((c, i) => (
                  <div key={i} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.03] py-0.5 pr-0.5 pl-2.5">
                    <Mail size={13} className="shrink-0 text-sky-400" />
                    <a href={`mailto:${c.value.trim()}`} className="min-w-0 flex-1 truncate text-[13px] text-foreground/90 hover:text-accent">
                      {c.value.trim()}
                    </a>
                    <CopyButton text={c.value.trim()} label={`Copy ${c.value.trim()}`} />
                  </div>
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {others.map((c, i) => {
                  const s = SOCIAL[c.kind] ?? SOCIAL.other!;
                  const href = hrefOf(c.kind, c.value);
                  const inner = (
                    <>
                      <s.Icon size={13} className={`shrink-0 ${s.tone}`} /> {s.name}
                    </>
                  );
                  const cls = "flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-xs text-foreground/85 transition-colors hover:bg-white/[0.08] hover:text-foreground";
                  return href ? (
                    <a key={i} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" title={c.value.trim()} className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <span key={i} title={c.value.trim()} className={cls}>
                      {inner}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
const isCheck = (f: FieldData) => /^to check$/i.test(f.name.trim());

// A lead's properties, read visually: numbers as tiles, tags as chips under
// their names, links as buttons, text as text, and what's left to check as
// a callout. Only what's filled shows.
export function FactsView({ fields, values }: { fields: FieldData[]; values: Record<string, unknown> }) {
  const filled = fields.filter((f) => f.kind !== "contacts" && isFilled(f.kind, values[f.id]));
  if (!filled.length) return null;
  const numbers = filled.flatMap((f) => {
    const n = numberOf(f, values[f.id]);
    return n ? [{ f, n }] : [];
  });
  const tags = filled.filter((f) => (f.kind === "select" || f.kind === "multi") && !isCheck(f));
  const links = filled.filter((f) => f.kind === "links").flatMap((f) => (values[f.id] as LinkValue[]).filter((l) => l.url.trim()));
  const checks = filled.filter(isCheck).flatMap((f) => {
    const v = values[f.id];
    return Array.isArray(v) ? (v as string[]).flatMap((id) => f.options.filter((o) => o.id === id).map((o) => o.name)) : String(v).split("\n").filter((x) => x.trim());
  });
  const texts = filled.filter((f) => f.kind === "text" && !isCheck(f) && !numberOf(f, values[f.id]));
  const rest = filled.filter((f) => f.kind === "date" || f.kind === "checkbox");

  return (
    <div className="flex flex-col gap-3">
      {checks.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5">
          {checks.map((c, i) => (
            <p key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
              {c}
            </p>
          ))}
        </div>
      )}
      {numbers.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {numbers.map(({ f, n }) => (
            <div key={f.id} className="panel-soft flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5">
              <span className="truncate text-[11px] text-muted">{f.name}</span>
              <span className="text-lg font-semibold tracking-tight text-foreground tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
          {tags.map((f) => (
            <div key={f.id} className="flex min-w-0 flex-col gap-1">
              <span className={LABEL}>{f.name}</span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {(values[f.id] as string[]).flatMap((id) => f.options.filter((o) => o.id === id)).map((o) => (
                  <TagPill key={o.id} name={o.name} color={o.color} wrap />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title={l.url}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-xs text-foreground/85 transition-colors hover:bg-white/[0.08] hover:text-foreground"
            >
              {/notion\.(site|so)/.test(l.url) ? <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] bg-white text-[9px] font-bold text-black">N</span> : <PlatformMark url={l.url} size={13} className="text-muted" />}
              <span className="truncate">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            </a>
          ))}
        </div>
      )}
      {texts.map((f) => (
        <div key={f.id} className="flex min-w-0 flex-col gap-1">
          <span className={LABEL}>{f.name}</span>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85">{String(values[f.id])}</p>
        </div>
      ))}
      {rest.map((f) => (
        <div key={f.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="text-muted">{f.name}</span>
          <span className="text-foreground/85">{f.kind === "checkbox" ? "Yes" : String(values[f.id])}</span>
        </div>
      ))}
    </div>
  );
}
