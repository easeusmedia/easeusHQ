"use client";

import { useRouter } from "next/navigation";

export type MapDepartment = { slug: string; name: string; people: number; open: number; late: number };

// The company as a little isometric city: each department a building on a
// lit grid, as tall as the work it has open, the work flowing between them
// in the order it travels (Sales on to Client Services, Content, Production,
// Distribution). Hover lifts the lights; a click opens the department.
// Drawn as plain SVG from an isometric projection; no 3D library.

const T = 54; // one grid unit, in viewBox px
const COS = 0.866;
const SIN = 0.5;
const GRID = { x: 10, y: 7 };
// where the buildings stand, in the departments' order: a ring round the
// grid (Sales at the back, round to Production at the front), so no
// building hides another and the labels keep apart; then the middle
const SLOTS: [number, number][] = [
  [1.5, 1.5],
  [5.0, 1.0],
  [8.5, 1.5],
  [8.0, 5.0],
  [4.5, 5.5],
  [1.5, 4.5],
  [4.8, 3.3],
  [9.3, 6.3],
];
// the work flows through the first five in order (Sales, Client Services,
// Content, Production, Distribution); the rest stand beside it
const FLOW = 5;
const FOOT = 1.3; // a building's width and depth
const TOP_ROOM = 3.0; // headroom above the grid for the tallest building and its label

const width = (GRID.x + GRID.y) * COS * T;
const height = (GRID.x + GRID.y) * SIN * T + TOP_ROOM * T;
const OX = GRID.y * COS * T;
const OY = TOP_ROOM * T;

// a point on the grid (gx, gy) at a height z, onto the page
const at = (gx: number, gy: number, z = 0): [number, number] => [(gx - gy) * COS * T + OX, (gx + gy) * SIN * T - z * T + OY];
const pts = (...p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function OrgMap({ departments }: { departments: MapDepartment[] }) {
  const router = useRouter();
  const most = Math.max(1, ...departments.map((d) => d.open));
  const placed = departments.slice(0, SLOTS.length).map((d, i) => {
    const [cx, cy] = SLOTS[i];
    // as tall as its open work, never flat
    const h = 0.6 + (d.open / most) * 1.7;
    return { ...d, cx, cy, h, x0: cx - FOOT / 2, x1: cx + FOOT / 2, y0: cy - FOOT / 2, y1: cy + FOOT / 2, i };
  });
  // back to front, so nearer buildings cover farther ones
  const drawn = [...placed].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));

  return (
    <div className="panel relative overflow-hidden rounded-2xl">
      {/* a cool glow under the city */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_62%,rgb(75_149_230/0.16),transparent_70%)]" />
      <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" role="img" aria-label="The company's departments">
          <defs>
            <linearGradient id="roof" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3f74ad" />
              <stop offset="1" stopColor="#24456b" />
            </linearGradient>
            <marker id="flow-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="rgb(125 180 245 / 0.85)" />
            </marker>
          </defs>

          {/* the ground: a lit grid */}
          <polygon points={pts(at(0, 0), at(GRID.x, 0), at(GRID.x, GRID.y), at(0, GRID.y))} fill="rgb(75 149 230 / 0.04)" stroke="rgb(140 195 255 / 0.22)" strokeWidth="1" />
          {Array.from({ length: GRID.x - 1 }, (_, i) => (
            <line key={`x${i}`} x1={at(i + 1, 0)[0]} y1={at(i + 1, 0)[1]} x2={at(i + 1, GRID.y)[0]} y2={at(i + 1, GRID.y)[1]} stroke="rgb(255 255 255 / 0.05)" />
          ))}
          {Array.from({ length: GRID.y - 1 }, (_, i) => (
            <line key={`y${i}`} x1={at(0, i + 1)[0]} y1={at(0, i + 1)[1]} x2={at(GRID.x, i + 1)[0]} y2={at(GRID.x, i + 1)[1]} stroke="rgb(255 255 255 / 0.05)" />
          ))}

          {/* the work flowing from one department to the next, along the ground */}
          {placed.slice(1, FLOW).map((b, n) => {
            const a = placed[n];
            const [x1, y1] = at(a.cx, a.cy);
            const [x2, y2] = at(b.cx, b.cy);
            // stop short of each building's footprint
            const k = FOOT / 2 / Math.hypot(b.cx - a.cx, b.cy - a.cy) + 0.06;
            return (
              <line
                key={`f${b.slug}`}
                x1={x1 + (x2 - x1) * k}
                y1={y1 + (y2 - y1) * k}
                x2={x2 - (x2 - x1) * k}
                y2={y2 - (y2 - y1) * k}
                stroke="rgb(125 180 245 / 0.75)"
                strokeWidth="1.6"
                strokeDasharray="6 7"
                markerEnd="url(#flow-head)"
                className="flow-dash"
              />
            );
          })}

          {drawn.map((b) => {
            const floors = Math.max(1, Math.round(b.h / 0.32));
            return (
              <g
                key={b.slug}
                role="link"
                tabIndex={0}
                aria-label={`${b.name}: ${b.people} people, ${b.open} open`}
                onClick={() => router.push(`/org/${b.slug}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/org/${b.slug}`)}
                className="group/b rise-in cursor-pointer outline-none"
                style={{ animationDelay: `${b.i * 90}ms` }}
              >
                {/* a lit pad on the ground */}
                <polygon
                  points={pts(at(b.x0 - 0.25, b.y0 - 0.25), at(b.x1 + 0.25, b.y0 - 0.25), at(b.x1 + 0.25, b.y1 + 0.25), at(b.x0 - 0.25, b.y1 + 0.25))}
                  fill="rgb(75 149 230 / 0.06)"
                  stroke="rgb(125 180 245 / 0.35)"
                  className="transition-[fill,stroke] duration-300 group-hover/b:fill-[rgb(75_149_230/0.16)] group-hover/b:stroke-[rgb(150_200_255/0.8)] group-focus-visible/b:stroke-[rgb(150_200_255/0.8)]"
                />
                <g className="transition-[filter] duration-300 group-hover/b:[filter:drop-shadow(0_0_14px_rgb(75_149_230/0.75))] group-focus-visible/b:[filter:drop-shadow(0_0_14px_rgb(75_149_230/0.75))]">
                  {/* the two walls we see, then the roof */}
                  <polygon points={pts(at(b.x0, b.y1), at(b.x1, b.y1), at(b.x1, b.y1, b.h), at(b.x0, b.y1, b.h))} fill="#172a40" stroke="rgb(140 195 255 / 0.35)" strokeWidth="0.8" className="transition-[fill] duration-300 group-hover/b:fill-[#1e3654]" />
                  <polygon points={pts(at(b.x1, b.y0), at(b.x1, b.y1), at(b.x1, b.y1, b.h), at(b.x1, b.y0, b.h))} fill="#0f1c2c" stroke="rgb(140 195 255 / 0.3)" strokeWidth="0.8" className="transition-[fill] duration-300 group-hover/b:fill-[#152740]" />
                  {/* its floors, as lit lines along both walls */}
                  {Array.from({ length: floors - 1 }, (_, f) => {
                    const z = ((f + 1) * b.h) / floors;
                    return (
                      <g key={f} stroke="rgb(125 180 245 / 0.22)" strokeWidth="0.7">
                        <line x1={at(b.x0, b.y1, z)[0]} y1={at(b.x0, b.y1, z)[1]} x2={at(b.x1, b.y1, z)[0]} y2={at(b.x1, b.y1, z)[1]} />
                        <line x1={at(b.x1, b.y1, z)[0]} y1={at(b.x1, b.y1, z)[1]} x2={at(b.x1, b.y0, z)[0]} y2={at(b.x1, b.y0, z)[1]} />
                      </g>
                    );
                  })}
                  <polygon points={pts(at(b.x0, b.y0, b.h), at(b.x1, b.y0, b.h), at(b.x1, b.y1, b.h), at(b.x0, b.y1, b.h))} fill="url(#roof)" stroke="rgb(170 210 255 / 0.7)" strokeWidth="0.9" />
                </g>
                {/* the stem up to its label */}
                <line x1={at(b.cx, b.cy, b.h)[0]} y1={at(b.cx, b.cy, b.h)[1]} x2={at(b.cx, b.cy, b.h + 0.55)[0]} y2={at(b.cx, b.cy, b.h + 0.55)[1]} stroke="rgb(170 210 255 / 0.6)" strokeWidth="1" />
                {b.late > 0 && <circle cx={at(b.cx, b.cy, b.h)[0]} cy={at(b.cx, b.cy, b.h)[1]} r="3.2" className="animate-pulse fill-rose-400" />}
              </g>
            );
          })}
        </svg>

        {/* each building's label, over the drawing */}
        {placed.map((b) => {
          const [x, y] = at(b.cx, b.cy, b.h + 0.55);
          return (
            <button
              key={b.slug}
              type="button"
              tabIndex={-1}
              onClick={() => router.push(`/org/${b.slug}`)}
              style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }}
              className="popover absolute max-w-44 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-left whitespace-nowrap transition-colors hover:border-accent/40"
            >
              <span className="block truncate text-xs font-medium">{b.name}</span>
              <span className="block text-[10px] text-muted tabular-nums">
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
