"use client";

import Image from "next/image";
import { createElement } from "react";
import { ArrowRight, Building2, Clapperboard, Handshake, Lightbulb, Send, TrendingUp, UserPlus, Wallet, type LucideIcon } from "lucide-react";
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
function Mark({ name }: { name: string }) {
  return createElement(MARKS.find(([key]) => key.test(name))?.[1] ?? Building2, { size: 20, strokeWidth: 2.5 });
}

// The company as one dark card under soft light, caught green on its edge: the Easeus mark,
// the headline counts, then a row a department with its open and late work
// and its people, each opening its page.
export function OrgMap({ departments, people }: { departments: MapDepartment[]; people: number }) {
  const open = departments.reduce((s, d) => s + d.open, 0);
  const late = departments.reduce((s, d) => s + d.late, 0);
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden rounded-3xl bg-[#0a0a0b] px-4 py-10 sm:py-14">
      {/* the light: soft white rays across from the top left */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[4%] h-[70rem] w-28 origin-top -rotate-[42deg] bg-gradient-to-b from-white/35 via-white/[0.08] to-transparent blur-2xl" />
        <div className="absolute -top-24 left-[11%] h-[58rem] w-10 origin-top -rotate-[42deg] bg-gradient-to-b from-white/45 via-white/[0.06] to-transparent blur-xl" />
        <div className="absolute -top-24 left-[18%] h-[48rem] w-20 origin-top -rotate-[42deg] bg-gradient-to-b from-white/25 via-white/[0.05] to-transparent blur-2xl" />
      </div>

      <section className="rise-in relative w-full max-w-[34rem] overflow-hidden rounded-[2.25rem] border border-white/[0.07] bg-[linear-gradient(180deg,#1d1d20_0%,#141416_45%,#111113_100%)] px-6 pt-10 pb-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-10 sm:pb-9">
        {/* a fine dot grid, fading down the card */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(180deg,black,transparent_55%)]" />
        {/* green light caught on the top and left edges */}
        <div aria-hidden className="pointer-events-none absolute top-0 left-[18%] h-px w-[40%] bg-gradient-to-r from-transparent via-[#3ee07f] to-transparent" />
        <div aria-hidden className="pointer-events-none absolute top-[38%] left-0 h-[42%] w-px bg-gradient-to-b from-transparent via-[#3ee07f]/90 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -top-16 left-[22%] size-40 rounded-full bg-[#3ee07f]/[0.14] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute top-[45%] -left-20 size-40 rounded-full bg-[#3ee07f]/[0.14] blur-3xl" />

        {/* the mark, as a glossy tile */}
        <div className="relative mx-auto flex size-[5.25rem] items-center justify-center rounded-[1.4rem] bg-[linear-gradient(180deg,#3b3e46,#1c1e22)] shadow-[0_18px_36px_-10px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_6px_rgba(0,0,0,0.4)]">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
        </div>

        <h1 className="relative mt-7 text-center text-[1.65rem] font-semibold tracking-tight text-white">Organization</h1>
        <p className="relative mt-2 text-center text-[15px] text-white/50 tabular-nums">
          {people} {people === 1 ? "person" : "people"} · {open} open · {late} late
        </p>

        <ul className="relative mt-9 flex flex-col gap-2">
          {departments.map((d) => (
            <li key={d.slug}>
              <PrefetchLink href={`/org/${d.slug}`} className="group -mx-2 flex items-center gap-4 rounded-2xl px-2 py-2 hover:bg-white/[0.03]">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#14301f] text-[#3ee07f] ring-1 ring-[#3ee07f]/10">
                  <Mark name={d.name} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-white">{d.name}</span>
                  <span className="block truncate text-sm text-white/45 tabular-nums">
                    {d.open} open
                    {d.late > 0 && <span className="text-rose-300/80"> · {d.late} late</span>} · {d.members.length} {d.members.length === 1 ? "person" : "people"}
                  </span>
                </span>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-[#141416] text-white transition-colors group-hover:border-white/25 group-hover:bg-white/[0.07]">
                  <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </PrefetchLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
