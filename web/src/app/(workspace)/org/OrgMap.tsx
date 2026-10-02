"use client";

import { useRouter } from "next/navigation";

export type MapDepartment = { slug: string; name: string; people: number; open: number; late: number };

// The company as a holographic night city, after the "3D visual
// management" references: each department a glass building (a tower on a
// podium, twin towers, or stepped blocks) with lit windows, glowing edges
// and a scan of light rising through it, as tall as the work it has open;
// a glowing pad pulses under each, sparks drift up, and light runs along
// the ground from one department to the next in the order client work
// travels. HUD tags name each one. Hover lights it up; a click opens it.
// Plain SVG from an isometric projection: no 3D library.

const T = 50; // one grid unit, in viewBox px
const COS = 0.866;
const SIN = 0.5;
const GRID = { x: 11, y: 8 };
// where the buildings stand, in the departments' order: a ring round the
// grid so none hides another, then the middle
const SLOTS: [number, number][] = [
  [2, 2],
  [5.6, 1.4],
  [9.2, 2],
  [8.8, 5.8],
  [5.2, 6.4],
  [1.9, 5.4],
  [5.4, 3.9],
  [10, 7],
];
// client work flows through the first five in order; the rest stand beside it
const FLOW = 5;

const width = (GRID.x + GRID.y) * COS * T;
const ground = (GRID.x + GRID.y) * SIN * T;
const OX = GRID.y * COS * T;
// a point on the grid at a height, with the grid's back corner at y 0 (the
// drawing is moved down by just enough headroom for its tallest building)
const at = (gx: number, gy: number, z = 0): [number, number] => [(gx - gy) * COS * T + OX, (gx + gy) * SIN * T - z * T];
const pts = (...p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

type Box = { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number };

// a building's blocks around its centre, by its kind and height
function blocks(kind: number, cx: number, cy: number, h: number): Box[] {
  const box = (dx: number, dy: number, w: number, d: number, z0: number, z1: number): Box => ({ x0: cx + dx - w / 2, y0: cy + dy - d / 2, x1: cx + dx + w / 2, y1: cy + dy + d / 2, z0, z1 });
  if (kind === 1)
    // twin towers on a podium
    return [box(0, 0, 1.9, 1.5, 0, 0.35), box(-0.45, 0.1, 0.7, 0.8, 0.35, 0.35 + h * 0.75), box(0.5, -0.15, 0.7, 0.8, 0.35, 0.35 + h)];
  if (kind === 2)
    // stepped blocks
    return [box(0, 0, 1.8, 1.8, 0, h * 0.45), box(0, 0, 1.3, 1.3, h * 0.45, h * 0.8), box(0, 0, 0.8, 0.8, h * 0.8, h + 0.2)];
  // a tower on a podium, with a crown
  return [box(0, 0, 1.8, 1.8, 0, 0.4), box(0, 0, 1.05, 1.05, 0.4, 0.4 + h), box(0, 0, 0.6, 0.6, 0.4 + h, 0.65 + h)];
}

// a steady scatter, so the same windows stay lit between renders
const lit = (a: number, b: number, c: number) => ((Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1 + 1) % 1 > 0.42;

// one block: its two walls we can see, their windows, its roof, and its glowing edges
function Block({ b, seed }: { b: Box; seed: number }) {
  const floor = 0.24;
  const floors = Math.max(1, Math.floor((b.z1 - b.z0) / floor));
  const colsX = Math.max(1, Math.floor((b.x1 - b.x0) / 0.24));
  const colsY = Math.max(1, Math.floor((b.y1 - b.y0) / 0.24));
  const windows: React.ReactNode[] = [];
  for (let f = 0; f < floors; f++) {
    const za = b.z0 + f * floor + 0.07;
    const zb = za + 0.11;
    if (zb > b.z1 - 0.03) break;
    for (let c = 0; c < colsX; c++) {
      const step = (b.x1 - b.x0) / colsX;
      const xa = b.x0 + c * step + step * 0.22;
      const xb = xa + step * 0.56;
      windows.push(<polygon key={`l${f}-${c}`} points={pts(at(xa, b.y1, za), at(xb, b.y1, za), at(xb, b.y1, zb), at(xa, b.y1, zb))} className={lit(seed, f, c) ? "fill-[rgb(190_230_255/0.85)]" : "fill-[rgb(120_180_255/0.12)]"} />);
    }
    for (let c = 0; c < colsY; c++) {
      const step = (b.y1 - b.y0) / colsY;
      const ya = b.y0 + c * step + step * 0.22;
      const yb = ya + step * 0.56;
      windows.push(<polygon key={`r${f}-${c}`} points={pts(at(b.x1, ya, za), at(b.x1, yb, za), at(b.x1, yb, zb), at(b.x1, ya, zb))} className={lit(seed + 7, f, c) ? "fill-[rgb(160_210_255/0.6)]" : "fill-[rgb(100_160_240/0.08)]"} />);
    }
  }
  return (
    <>
      <polygon points={pts(at(b.x0, b.y1, b.z0), at(b.x1, b.y1, b.z0), at(b.x1, b.y1, b.z1), at(b.x0, b.y1, b.z1))} fill="url(#wall-left)" />
      <polygon points={pts(at(b.x1, b.y0, b.z0), at(b.x1, b.y1, b.z0), at(b.x1, b.y1, b.z1), at(b.x1, b.y0, b.z1))} fill="url(#wall-right)" />
      {windows}
      <polygon points={pts(at(b.x0, b.y0, b.z1), at(b.x1, b.y0, b.z1), at(b.x1, b.y1, b.z1), at(b.x0, b.y1, b.z1))} fill="url(#roof)" />
      {/* the edges that catch the light */}
      <g fill="none" stroke="rgb(165 220 255 / 0.9)" strokeWidth="0.9" filter="url(#edge-glow)">
        <polyline points={pts(at(b.x0, b.y1, b.z1), at(b.x0, b.y0, b.z1), at(b.x1, b.y0, b.z1), at(b.x1, b.y1, b.z1), at(b.x0, b.y1, b.z1), at(b.x0, b.y1, b.z0), at(b.x1, b.y1, b.z0), at(b.x1, b.y0, b.z0), at(b.x1, b.y0, b.z1))} />
        <line x1={at(b.x1, b.y1, b.z0)[0]} y1={at(b.x1, b.y1, b.z0)[1]} x2={at(b.x1, b.y1, b.z1)[0]} y2={at(b.x1, b.y1, b.z1)[1]} />
      </g>
    </>
  );
}

export function OrgMap({ departments }: { departments: MapDepartment[] }) {
  const router = useRouter();
  const most = Math.max(1, ...departments.map((d) => d.open));
  const placed = departments.slice(0, SLOTS.length).map((d, i) => {
    const [cx, cy] = SLOTS[i];
    const h = 1.1 + (d.open / most) * 2.8;
    const parts = blocks(i % 3, cx, cy, h);
    const top = Math.max(...parts.map((p) => p.z1));
    return { ...d, i, cx, cy, h, parts, top };
  });
  // headroom: enough above the grid for the highest tag (about 44px tall)
  const oy = Math.max(30, ...placed.map((b) => (b.top + 0.75) * T + 50 - (b.cx + b.cy) * SIN * T));
  const height = ground + oy + 12;
  // back to front, so nearer buildings cover farther ones
  const drawn = [...placed].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  const open = (slug: string) => router.push(`/org/${slug}`);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgb(120_190_255/0.18)] bg-[radial-gradient(70%_60%_at_50%_58%,#0d2440_0%,#071526_55%,#040a13_100%)]">
      {/* a faint scan of the whole view */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(120_190_255/0.035)_0_1px,transparent_1px_4px)]" />
      <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" role="img" aria-label="The company's departments">
          <defs>
            <linearGradient id="wall-left" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(90 165 250 / 0.55)" />
              <stop offset="1" stopColor="rgb(20 60 130 / 0.18)" />
            </linearGradient>
            <linearGradient id="wall-right" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(55 120 215 / 0.45)" />
              <stop offset="1" stopColor="rgb(12 35 85 / 0.15)" />
            </linearGradient>
            <linearGradient id="roof" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="rgb(170 220 255 / 0.6)" />
              <stop offset="1" stopColor="rgb(80 150 240 / 0.35)" />
            </linearGradient>
            <radialGradient id="pad">
              <stop offset="0" stopColor="rgb(110 190 255 / 0.45)" />
              <stop offset="0.6" stopColor="rgb(75 149 230 / 0.12)" />
              <stop offset="1" stopColor="rgb(75 149 230 / 0)" />
            </radialGradient>
            <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(170 225 255 / 0)" />
              <stop offset="0.5" stopColor="rgb(170 225 255 / 0.5)" />
              <stop offset="1" stopColor="rgb(170 225 255 / 0)" />
            </linearGradient>
            <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {placed.map((b) => (
              <clipPath key={b.slug} id={`body-${b.slug}`}>
                {b.parts.map((p, n) => (
                  <polygon key={n} points={pts(at(p.x0, p.y0, p.z1), at(p.x1, p.y0, p.z1), at(p.x1, p.y0, p.z0), at(p.x1, p.y1, p.z0), at(p.x0, p.y1, p.z0), at(p.x0, p.y1, p.z1))} />
                ))}
              </clipPath>
            ))}
          </defs>

          <g transform={`translate(0 ${oy})`}>
          {/* the ground: a dark plate with a fine lit grid */}
          <polygon points={pts(at(0, 0), at(GRID.x, 0), at(GRID.x, GRID.y), at(0, GRID.y))} fill="rgb(8 24 44 / 0.75)" stroke="rgb(120 190 255 / 0.3)" strokeWidth="1" />
          {Array.from({ length: GRID.x * 2 - 1 }, (_, i) => (
            <line key={`x${i}`} x1={at((i + 1) / 2, 0)[0]} y1={at((i + 1) / 2, 0)[1]} x2={at((i + 1) / 2, GRID.y)[0]} y2={at((i + 1) / 2, GRID.y)[1]} stroke={`rgb(120 190 255 / ${i % 2 ? 0.07 : 0.035})`} />
          ))}
          {Array.from({ length: GRID.y * 2 - 1 }, (_, i) => (
            <line key={`y${i}`} x1={at(0, (i + 1) / 2)[0]} y1={at(0, (i + 1) / 2)[1]} x2={at(GRID.x, (i + 1) / 2)[0]} y2={at(GRID.x, (i + 1) / 2)[1]} stroke={`rgb(120 190 255 / ${i % 2 ? 0.07 : 0.035})`} />
          ))}

          {/* the work's road from one department to the next, with light running along it */}
          {placed.slice(1, FLOW).map((b, n) => {
            const a = placed[n];
            const [x1, y1] = at(a.cx, a.cy);
            const [x2, y2] = at(b.cx, b.cy);
            const d = `M${x1},${y1} L${x2},${y2}`;
            return (
              <g key={`f${b.slug}`}>
                <path d={d} stroke="rgb(120 190 255 / 0.18)" strokeWidth="6" strokeLinecap="round" />
                <path d={d} stroke="rgb(150 210 255 / 0.55)" strokeWidth="1.2" strokeDasharray="5 7" className="flow-dash" />
                {[0, 1.2].map((delay) => (
                  <circle key={delay} r="2.6" className="fill-[rgb(200_235_255)]" filter="url(#edge-glow)">
                    <animateMotion dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))}
              </g>
            );
          })}

          {drawn.map((b) => {
            const pad = 1.35;
            const [, baseY] = at(b.cx, b.cy, 0);
            const [, topY] = at(b.cx, b.cy, b.top);
            const roof = at(b.cx, b.cy, b.top);
            const tip = at(b.cx, b.cy, b.top + 0.6);
            return (
              <g
                key={b.slug}
                role="link"
                tabIndex={0}
                aria-label={`${b.name}: ${b.people} people, ${b.open} open`}
                onClick={() => open(b.slug)}
                onKeyDown={(e) => e.key === "Enter" && open(b.slug)}
                className="rise-in cursor-pointer outline-none transition-[filter] duration-300 hover:[filter:brightness(1.3)_drop-shadow(0_0_14px_rgb(120_200_255/0.55))] focus-visible:[filter:brightness(1.3)_drop-shadow(0_0_14px_rgb(120_200_255/0.55))]"
                style={{ animationDelay: `${b.i * 100}ms` }}
              >
                {/* the glowing pad it stands on, and a ring pulsing out from it */}
                <polygon points={pts(at(b.cx - pad, b.cy - pad), at(b.cx + pad, b.cy - pad), at(b.cx + pad, b.cy + pad), at(b.cx - pad, b.cy + pad))} fill="url(#pad)" stroke="rgb(140 205 255 / 0.45)" strokeWidth="1" />
                <polygon points={pts(at(b.cx - pad, b.cy - pad), at(b.cx + pad, b.cy - pad), at(b.cx + pad, b.cy + pad), at(b.cx - pad, b.cy + pad))} fill="none" stroke="rgb(140 205 255 / 0.6)" strokeWidth="1" className="pad-pulse" />
                {b.parts.map((p, n) => (
                  <Block key={n} b={p} seed={b.i * 31 + n * 7} />
                ))}
                {/* a band of light rising through the glass */}
                <g clipPath={`url(#body-${b.slug})`}>
                  <rect x={roof[0] - 80} y={baseY - 18} width="160" height="36" fill="url(#scan)" className="scan-up" style={{ ["--rise" as string]: `${topY - baseY}px` }} />
                </g>
                {/* the mast, its light red if anything's late */}
                <line x1={roof[0]} y1={roof[1]} x2={tip[0]} y2={tip[1]} stroke="rgb(170 220 255 / 0.8)" strokeWidth="1" />
                <circle cx={tip[0]} cy={tip[1]} r="2.8" className={`blink ${b.late ? "fill-rose-400" : "fill-[rgb(170_225_255)]"}`} filter="url(#edge-glow)" />
                {/* sparks drifting up */}
                {[0, 1, 2].map((s) => (
                  <circle key={s} cx={roof[0] + (s - 1) * 14} cy={baseY - 6} r="1.2" className="spark fill-[rgb(180_225_255)]" style={{ animationDelay: `${s * 1.1 + b.i * 0.4}s`, ["--rise" as string]: `${topY - baseY - 20}px` }} />
                ))}
              </g>
            );
          })}
          </g>
        </svg>

        {/* each building's tag, over the drawing */}
        {placed.map((b) => {
          const [x, y] = at(b.cx, b.cy, b.top + 0.75);
          return (
            <button
              key={b.slug}
              type="button"
              tabIndex={-1}
              onClick={() => open(b.slug)}
              style={{ left: `${(x / width) * 100}%`, top: `${((y + oy) / height) * 100}%` }}
              className="absolute max-w-48 -translate-x-1/2 -translate-y-full border-l-2 border-[rgb(140_205_255)] bg-[rgb(6_18_32/0.82)] px-2.5 py-1.5 text-left whitespace-nowrap shadow-[0_0_18px_rgb(75_149_230/0.25)] backdrop-blur-sm transition-colors hover:bg-[rgb(10_30_52/0.9)]"
            >
              {/* the corner ticks of a heads-up display */}
              <span aria-hidden className="absolute -top-px -right-px h-2 w-2 border-t border-r border-[rgb(140_205_255/0.7)]" />
              <span aria-hidden className="absolute -right-px -bottom-px h-2 w-2 border-r border-b border-[rgb(140_205_255/0.7)]" />
              <span className="block truncate text-[11px] font-semibold tracking-wide text-[rgb(215_238_255)] uppercase">{b.name}</span>
              <span className="block text-[10px] text-[rgb(150_190_225)] tabular-nums">
                {b.people} {b.people === 1 ? "person" : "people"} · {b.open} open
                {b.late > 0 && <span className="text-rose-300"> · {b.late} late</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
