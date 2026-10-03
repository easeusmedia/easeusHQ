"use client";

import { createElement } from "react";
import { ArrowRight, Building2, Clapperboard, Clock, Handshake, Lightbulb, ListChecks, Send, TrendingUp, UserPlus, Users, Wallet, type LucideIcon } from "lucide-react";
import { PrefetchLink } from "../PrefetchLink";

export type MapDepartment = { slug: string; name: string; open: number; late: number; members: string[] };

// What each department does, as its icon
const MARKS: [RegExp, LucideIcon][] = [
  [/sales/i, TrendingUp],
  [/client|operat/i, Handshake],
  [/content|strateg|idea/i, Lightbulb],
  [/produc/i, Clapperboard],
  [/distrib|growth/i, Send],
  [/\bhr\b|talent|hiring|recruit/i, UserPlus],
  [/financ|admin/i, Wallet],
];
function Mark({ name, size }: { name: string; size: number }) {
  return createElement(MARKS.find(([key]) => key.test(name))?.[1] ?? Building2, { size, strokeWidth: 2.2 });
}

// The company under soft light: its headline counts, then a dark card a
// department, each with its icon, its people, and a row each for its open
// work, its late work and its team, every row opening the department.
export function OrgMap({ departments, people }: { departments: MapDepartment[]; people: number }) {
  const open = departments.reduce((s, d) => s + d.open, 0);
  const late = departments.reduce((s, d) => s + d.late, 0);
  return (
    <div className="@container relative min-h-full overflow-hidden rounded-3xl bg-[#090a0c] px-4 py-8 sm:px-8 sm:py-10">
      {/* the light: soft white rays across from the top left */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[4%] h-[70rem] w-28 origin-top -rotate-[42deg] bg-gradient-to-b from-white/30 via-white/[0.06] to-transparent blur-2xl" />
        <div className="absolute -top-24 left-[11%] h-[58rem] w-10 origin-top -rotate-[42deg] bg-gradient-to-b from-white/40 via-white/[0.05] to-transparent blur-xl" />
        <div className="absolute -top-24 left-[18%] h-[48rem] w-20 origin-top -rotate-[42deg] bg-gradient-to-b from-white/20 via-white/[0.04] to-transparent blur-2xl" />
        <div className="absolute -top-40 right-[8%] size-[28rem] rounded-full bg-accent/[0.07] blur-3xl" />
      </div>

      <header className="relative">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Organization</h1>
        <p className="mt-1.5 text-sm text-white/50 tabular-nums">
          {people} {people === 1 ? "person" : "people"} · {open} open · {late} late
        </p>
      </header>

      <div className="relative mt-8 grid gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {departments.map((d, i) => (
          <Card key={d.slug} d={d} delay={i * 60} />
        ))}
      </div>
    </div>
  );
}

function Card({ d, delay }: { d: MapDepartment; delay: number }) {
  const href = `/org/${d.slug}`;
  const first = d.members.map((n) => n.split(" ")[0]);
  const team = first.length ? `${first.slice(0, 3).join(", ")}${first.length > 3 ? ` +${first.length - 3}` : ""}` : "No one yet";
  return (
    <section
      className="rise-in relative overflow-hidden rounded-[2rem] border border-white/[0.07] bg-[linear-gradient(180deg,#1b1e24_0%,#14161a_48%,#111316_100%)] px-6 pt-9 pb-5 shadow-[0_40px_80px_-36px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* a fine dot grid, fading down the card */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(180deg,black,transparent_50%)]" />
      {/* the accent caught on the top and left edges */}
      <div aria-hidden className="pointer-events-none absolute top-0 left-[16%] h-px w-[42%] bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div aria-hidden className="pointer-events-none absolute top-[40%] left-0 h-[40%] w-px bg-gradient-to-b from-transparent via-accent/80 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -top-16 left-[20%] size-36 rounded-full bg-accent/[0.14] blur-3xl" />

      {/* the department's icon, as a glossy tile */}
      <div className="relative mx-auto flex size-[4.5rem] items-center justify-center rounded-[1.25rem] bg-[linear-gradient(180deg,#363a43,#1b1d22)] text-accent shadow-[0_16px_32px_-10px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_6px_rgba(0,0,0,0.4)]">
        <Mark name={d.name} size={30} />
      </div>
      <h2 className="relative mt-5 truncate text-center text-xl font-semibold tracking-tight text-white">{d.name}</h2>
      <p className="relative mt-1 text-center text-sm text-white/45 tabular-nums">
        {d.members.length} {d.members.length === 1 ? "person" : "people"}
      </p>

      <ul className="relative mt-7 flex flex-col gap-1">
        <Row href={href} Icon={ListChecks} tile="badge-lit" title="Open work" note={`${d.open} ${d.open === 1 ? "task" : "tasks"} in hand`} />
        <Row href={href} Icon={Clock} tile={d.late ? "bg-rose-500/15 text-rose-300" : "badge"} title="Late" note={`${d.late} past due`} />
        <Row href={href} Icon={Users} tile="badge-lit" title="Team" note={team} />
      </ul>
    </section>
  );
}

function Row({ href, Icon, tile, title, note }: { href: string; Icon: LucideIcon; tile: string; title: string; note: string }) {
  return (
    <li>
      <PrefetchLink href={href} className="group -mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2 hover:bg-white/[0.03]">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.05] ${tile}`}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-white">{title}</span>
          <span className="block truncate text-[13px] text-white/45 tabular-nums">{note}</span>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-[#141518] text-white transition-colors group-hover:border-white/25 group-hover:bg-white/[0.07]">
          <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </PrefetchLink>
    </li>
  );
}
