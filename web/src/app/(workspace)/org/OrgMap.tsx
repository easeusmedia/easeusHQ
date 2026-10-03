"use client";

import Image from "next/image";
import Link from "next/link";
import { createElement, useState } from "react";
import { ArrowRight, Building2, Clapperboard, Handshake, Lightbulb, Send, TrendingUp, UserPlus, Wallet, type LucideIcon } from "lucide-react";

export type MapDepartment = { slug: string; name: string; people: number; open: number; late: number; members: string[] };

// What each department does, as its mark
const MARKS: [RegExp, LucideIcon][] = [
  [/sales/i, TrendingUp],
  [/client|operat/i, Handshake],
  [/content|strateg|idea/i, Lightbulb],
  [/produc/i, Clapperboard],
  [/distrib|growth/i, Send],
  [/\bhr\b|talent|hiring|recruit/i, UserPlus],
  [/financ|admin/i, Wallet],
];
function Mark({ name, size, color, className }: { name: string; size: number; color: string; className?: string }) {
  const Icon = MARKS.find(([key]) => key.test(name))?.[1] ?? Building2;
  return createElement(Icon, { size, className, style: { color } });
}
// the glows round the ring, one per department, in turn
const HUES = ["#34d399", "#a855f7", "#3b82f6", "#facc15", "#f472b6", "#22d3ee", "#fb923c", "#a3e635"];

// where something sits on the ring: an angle (0 at the top, clockwise) and a
// radius, both as a share of the square, as left/top percentages
const at = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
};

// The company as a ring, after a "scope of work" diagram: the Easeus mark at
// the centre, each department a glass card round it, its glowing mark on the
// ticked outer ring, joined to the centre by a dashed spoke. A card shows the
// department's people and its open and late work, and opens its page.
// Phones get the cards in a column.
export function OrgMap({ departments }: { departments: MapDepartment[] }) {
  const [hot, setHot] = useState<string | null>(null);
  const n = departments.length;
  const angle = (i: number) => (360 / n) * i;

  return (
    <>
      <div className="relative hidden min-h-[34rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#050607] [container-type:size] sm:flex">
        <div className="relative" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
          {/* colour in the dark: a soft glow behind each department, one at the core */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {departments.map((d, i) => (
              <span
                key={d.slug}
                className="absolute size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-opacity duration-500"
                style={{ ...at(angle(i), 22), background: HUES[i % HUES.length], opacity: hot === d.slug ? 0.26 : 0.13 }}
              />
            ))}
            <span className="absolute top-1/2 left-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6] opacity-[0.12] blur-3xl" />
          </div>

          {/* the rings, the ticks and the spokes */}
          <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
            <defs>
              <radialGradient id="org-core" cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="#141922" />
                <stop offset="100%" stopColor="#07090c" />
              </radialGradient>
              <linearGradient id="org-mid" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47.6" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.15" />
            <circle cx="50" cy="50" r="45.6" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="2.2" strokeDasharray="0.16 0.64" />
            <circle cx="50" cy="50" r="31" fill="rgba(255,255,255,0.012)" stroke="url(#org-mid)" strokeWidth="0.18" />
            <circle cx="50" cy="50" r="15.5" fill="url(#org-core)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.15" />
            {departments.map((d, i) => {
              const a = ((angle(i) - 90) * Math.PI) / 180;
              const on = hot === d.slug;
              return (
                <line
                  key={d.slug}
                  x1={50 + Math.cos(a) * 6.5}
                  y1={50 + Math.sin(a) * 6.5}
                  x2={50 + Math.cos(a) * 43}
                  y2={50 + Math.sin(a) * 43}
                  stroke={on ? HUES[i % HUES.length] : "rgba(255,255,255,0.14)"}
                  strokeWidth={on ? 0.22 : 0.14}
                  strokeDasharray="0.7 0.7"
                  className="transition-[stroke] duration-300"
                />
              );
            })}
          </svg>

          {/* the way round, between the departments */}
          {departments.map((d, i) => (
            <span
              key={`arrow-${d.slug}`}
              aria-hidden
              className="absolute flex size-[clamp(1.5rem,4.4cqmin,2rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#0c0e11] text-white/45 ring-1 ring-white/10"
              style={at(angle(i) + 180 / n, 45.6)}
            >
              <ArrowRight size={12} style={{ transform: `rotate(${angle(i) + 180 / n}deg)` }} />
            </span>
          ))}

          {/* each department's mark on the outer ring */}
          {departments.map((d, i) => {
            const hue = HUES[i % HUES.length];
            const on = hot === d.slug;
            return (
              <span
                key={`mark-${d.slug}`}
                aria-hidden
                className="absolute flex size-[clamp(2.4rem,7cqmin,3.25rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-1 ring-white/15 transition-[box-shadow] duration-300"
                style={{
                  ...at(angle(i), 45.6),
                  background: `radial-gradient(circle at 50% 30%, ${hue}66, #0b0d10 72%)`,
                  boxShadow: `0 0 ${on ? 44 : 30}px ${hue}${on ? "cc" : "88"}, inset 0 0 14px ${hue}55`,
                }}
              >
                <Mark name={d.name} size={18} color={hue} />
              </span>
            );
          })}

          {/* the centre: the Easeus mark */}
          <span className="absolute top-1/2 left-1/2 flex size-[11%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#0d1015] ring-1 ring-white/[0.12] shadow-[0_0_40px_rgba(59,130,246,0.25)]">
            <Image src="/logo.png" alt="Easeus Media" width={28} height={28} className="h-[42%] w-auto object-contain" />
          </span>

          {/* the departments, as glass cards on the middle ring */}
          {departments.map((d, i) => (
            <Card key={d.slug} d={d} hue={HUES[i % HUES.length]} style={at(angle(i), 30.5)} onHover={(on) => setHot(on ? d.slug : null)} hot={hot === d.slug} />
          ))}
        </div>
      </div>

      {/* phones: the same cards, one under another */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        {departments.map((d, i) => (
          <Card key={d.slug} d={d} hue={HUES[i % HUES.length]} />
        ))}
      </div>
    </>
  );
}

function Card({ d, hue, style, hot = false, onHover }: { d: MapDepartment; hue: string; style?: React.CSSProperties; hot?: boolean; onHover?: (on: boolean) => void }) {
  const shown = d.members.slice(0, 3);
  const more = d.members.length - shown.length;
  return (
    <Link
      href={`/org/${d.slug}`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      style={style}
      className={`group flex flex-col gap-2.5 rounded-2xl border bg-white/[0.045] p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[border-color,background-color,transform] duration-300 ${
        style ? "absolute w-[clamp(9.5rem,21cqmin,13rem)] -translate-x-1/2 -translate-y-1/2" : "w-full"
      } ${hot ? "border-white/25 bg-white/[0.07]" : "border-white/[0.1] hover:border-white/20"}`}
    >
      <div className="flex items-start gap-2">
        {!style && <Mark name={d.name} size={15} color={hue} className="mt-0.5 shrink-0" />}
        <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-white">{d.name}</p>
        {/* the team, a dot a person */}
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="text-[9px] leading-none text-white/45">Team</span>
          <span className="flex gap-0.5">
            {Array.from({ length: Math.max(1, Math.min(6, d.people)) }, (_, k) => (
              <span key={k} className="h-1 w-1.5 rounded-full" style={{ background: d.people ? hue : "rgba(255,255,255,0.15)" }} />
            ))}
          </span>
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="flex flex-col gap-1 text-[11px] text-white/65">
          {shown.map((name, k) => (
            <li key={`${name}-${k}`} className="flex items-center gap-1.5">
              <span className="size-1 shrink-0 rounded-full bg-white/35" />
              <span className="truncate">{name}</span>
            </li>
          ))}
          {more > 0 && <li className="pl-2.5 text-white/40">+{more} more</li>}
        </ul>
      )}
      <p className="flex items-center gap-2 text-[10.5px] text-white/50 tabular-nums">
        <span>{d.open} open</span>
        {d.late > 0 && <span className="text-rose-300">{d.late} late</span>}
      </p>
    </Link>
  );
}
