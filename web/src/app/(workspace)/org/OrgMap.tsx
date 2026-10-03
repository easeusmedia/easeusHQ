"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export type MapDepartment = { slug: string; name: string; open: number; late: number };

// the line round the work goes cyan on the left to pink on the right
const COOL = [56, 189, 248];
const WARM = [244, 114, 182];
const tint = (t: number) => `rgb(${COOL.map((c, k) => Math.round(c + (WARM[k] - c) * t)).join(",")})`;

const R = 38; // the outer ring
const CORE = 9; // just outside the logo, where no work sits

// a point at an angle (0 at the top, clockwise) and a radius, in the 100-unit square
const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
};
const f = (n: number) => n.toFixed(2);

// a smooth closed curve through the points (Catmull-Rom as cubic Béziers)
function blob(p: number[][]) {
  const n = p.length;
  const at = (i: number) => p[(i + n) % n];
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return `${d} Z`;
}

// The company's work as a radar, after a skills chart: the Easeus mark at the
// centre, a spoke a department, and one glowing line round them that reaches
// out as far as each department's open work. The rings count the work. Each
// department's name sits at the end of its spoke and opens its page. Phones
// get the departments as rows with a bar each.
export function OrgMap({ departments, people }: { departments: MapDepartment[]; people: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const n = departments.length;
  const open = departments.reduce((s, d) => s + d.open, 0);
  const most = Math.max(0, ...departments.map((d) => d.open));
  const step = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500].find((s) => s * 4 >= most) ?? Math.ceil(most / 4);
  const top = step * 4;
  const angle = (i: number) => (360 / n) * i;
  const reach = (v: number) => CORE + ((R - CORE) * v) / top;
  const points = departments.map((d, i) => polar(angle(i), reach(d.open)));
  // a spoke's colour: where it points between the cool left and the warm right
  const hue = (i: number) => tint((1 + Math.sin((angle(i) * Math.PI) / 180)) / 2);

  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,#30333b,#24262c)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:min-h-[34rem] sm:flex-1">
      {/* the soft colour in the corners */}
      <div aria-hidden className="pointer-events-none absolute -top-24 right-[12%] size-80 rounded-full bg-[#f472b6] opacity-[0.07] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/2 size-96 -translate-x-1/2 rounded-full bg-[#38bdf8] opacity-[0.07] blur-3xl" />

      <header className="relative flex shrink-0 items-end justify-between gap-4 border-b border-white/[0.06] px-5 pt-5 pb-4 sm:px-7">
        <div className="flex items-end gap-3">
          <h1 className="text-xl tracking-wide whitespace-nowrap text-white uppercase sm:text-2xl">
            <span className="font-bold">Easeus</span> <span className="font-light">Media</span>
          </h1>
          <p className="hidden pb-1 text-[9px] leading-tight tracking-wider text-white/45 uppercase sm:block">
            {n} {n === 1 ? "department" : "departments"}
            <br />
            {people} {people === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <p className="pb-1 text-right text-[9px] leading-tight tracking-wider text-white/45 uppercase">
            Open
            <br />
            work
          </p>
          <p className="text-3xl leading-none font-extralight text-white tabular-nums sm:text-4xl">{String(open).padStart(2, "0")}</p>
        </div>
        <span aria-hidden className="absolute -bottom-px left-5 h-0.5 w-20 bg-[#38bdf8] sm:left-7" />
        <span aria-hidden className="absolute right-5 -bottom-px h-0.5 w-14 bg-[#f472b6] sm:right-7" />
      </header>

      {/* the radar */}
      <div className="relative hidden min-h-0 flex-1 items-center justify-center [container-type:size] sm:flex">
        <div className="relative" style={{ width: "min(100cqh, calc(100cqw - 18rem))", height: "min(100cqh, calc(100cqw - 18rem))" }}>
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id="radar-line" x1="0" y1="0.5" x2="1" y2="0.5">
                <stop offset="0%" stopColor={tint(0)} />
                <stop offset="55%" stopColor="#818cf8" />
                <stop offset="100%" stopColor={tint(1)} />
              </linearGradient>
              <radialGradient id="radar-fill">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.02" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.12" />
              </radialGradient>
              <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.1" />
              </filter>
            </defs>
            <circle cx="50" cy="50" r={R} fill="#202227" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
            {[1, 2, 3].map((k) => (
              <circle key={k} cx="50" cy="50" r={reach(step * k)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.18" />
            ))}
            {departments.map((d, i) => {
              const [x1, y1] = polar(angle(i), CORE);
              const [x2, y2] = polar(angle(i), R);
              return (
                <line
                  key={d.slug}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={hot === i ? hue(i) : "rgba(255,255,255,0.07)"}
                  strokeWidth={hot === i ? 0.3 : 0.18}
                  className="transition-[stroke] duration-300"
                />
              );
            })}
            {[1, 2, 3, 4].map((k) => (
              <text key={k} x="50" y={50 - reach(step * k) + 2.6} textAnchor="middle" fontSize="1.9" fill="rgba(255,255,255,0.35)" className="tabular-nums">
                {step * k}
              </text>
            ))}

            {/* the work: one glowing line round the spokes */}
            <g className="radar-in">
              {n === 1 ? (
                <circle cx="50" cy="50" r={reach(departments[0].open)} fill="url(#radar-fill)" stroke="url(#radar-line)" strokeWidth="0.8" />
              ) : (
                <>
                  <path d={blob(points)} fill="none" stroke="url(#radar-line)" strokeWidth="2.2" opacity="0.55" filter="url(#radar-glow)" />
                  <path d={blob(points)} fill="url(#radar-fill)" stroke="url(#radar-line)" strokeWidth="0.8" strokeLinejoin="round" />
                </>
              )}
              {hot !== null && <circle cx={points[hot][0]} cy={points[hot][1]} r="1" fill="#fff" stroke={hue(hot)} strokeWidth="0.5" />}
            </g>

            {/* a dot where each spoke meets the outer ring */}
            {departments.map((d, i) => {
              const [x, y] = polar(angle(i), R);
              return <circle key={d.slug} cx={x} cy={y} r={hot === i ? 1.3 : 0.85} fill={hue(i)} style={{ filter: `drop-shadow(0 0 1.2px ${hue(i)})` }} />;
            })}
          </svg>

          {/* the centre: the Easeus mark */}
          <span className="absolute top-1/2 left-1/2 flex size-[14%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#17191d] shadow-[0_0_0_3px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.5)]">
            <Image src="/logo.png" alt="Easeus Media" width={32} height={32} className="h-[42%] w-auto object-contain" />
          </span>

          {/* each department's name at the end of its spoke */}
          {departments.map((d, i) => {
            const [x, y] = polar(angle(i), R + 3.2);
            const side = Math.sin((angle(i) * Math.PI) / 180);
            const up = Math.cos((angle(i) * Math.PI) / 180);
            const middle = Math.abs(side) < 0.3;
            const shift = middle ? `-50%, ${up > 0 ? "-100%" : "0"}` : `${side > 0 ? "0" : "-100%"}, -50%`;
            return (
              <Link
                key={d.slug}
                href={`/org/${d.slug}`}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(i)}
                onBlur={() => setHot(null)}
                className={`absolute rounded-md px-1.5 py-1 whitespace-nowrap outline-none ${middle ? "text-center" : side > 0 ? "text-left" : "text-right"}`}
                style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${shift})` }}
              >
                <span className={`block text-[12px] font-semibold tracking-wider uppercase transition-colors duration-300 ${hot === i ? "text-white" : "text-white/85"}`}>{d.name}</span>
                <span className="block text-[10.5px] text-white/45 tabular-nums">
                  {d.open} open{d.late > 0 && <span className="text-rose-300/90"> · {d.late} late</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* phones: a row a department, its bar as long as its open work */}
      <ul className="relative flex flex-col px-5 py-3 sm:hidden">
        {departments.map((d, i) => (
          <li key={d.slug}>
            <Link href={`/org/${d.slug}`} className="flex flex-col gap-1.5 py-2.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-semibold tracking-wider text-white/85 uppercase">{d.name}</span>
                <span className="text-[10.5px] text-white/45 tabular-nums">
                  {d.open} open{d.late > 0 && <span className="text-rose-300/90"> · {d.late} late</span>}
                </span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full" style={{ width: `${top ? (d.open / top) * 100 : 0}%`, background: `linear-gradient(90deg, ${tint(0)}, ${hue(i)})` }} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div aria-hidden className="h-0.5 shrink-0 bg-[linear-gradient(90deg,#38bdf8,#818cf8,#f472b6)] opacity-70" />
    </section>
  );
}
