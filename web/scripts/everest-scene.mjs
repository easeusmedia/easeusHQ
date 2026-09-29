// The agreement page's backdrop (start/Shell.tsx): Everest before dawn,
// all in the app's blues. Drawn from numbers rather than a photograph, so
// it's ours and can be retuned: layered ranges that pale into the mist
// with distance, a sky lightening at the horizon, and Everest in the left
// third, where the page's left panel looks onto it, Lhotse beside it and
// Nuptse's wall in front, their snow picked out in fine gullies.
//
//   node scripts/everest-scene.mjs
//
// Writes public/start/everest.webp and src/app/start/everestRidge.ts (the
// summit's ridge line, for the glint that travels it).
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1600;
const H = 1000;
const N = 640; // points across a ridgeline

// a repeatable random: the same picture every run
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// smooth 1D noise in 0..1, several octaves
function noise(seed) {
  const r = rng(seed);
  const lattice = Array.from({ length: 4096 }, () => r());
  const at = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lattice[i & 4095] * (1 - u) + lattice[(i + 1) & 4095] * u;
  };
  return (x, octaves = 6) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += at(x * freq + o * 17.3) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
}

// A range: crested rather than rolling, by folding the noise (ridged)
function range(seed, baseY, amp, scale) {
  const n = noise(seed);
  return Array.from({ length: N + 1 }, (_, i) => {
    const x = (i / N) * (W + 80) - 40;
    const v = n(x / scale);
    const crest = Math.pow(1 - Math.abs(v * 2 - 1), 1.6);
    return [x, baseY - amp * crest];
  });
}

// Peaks as shapes: each a steep pyramid with a crumpled edge; the outline
// is the highest of them at each x
function peaks(seed, list, baseY) {
  const n = noise(seed);
  return Array.from({ length: N + 1 }, (_, i) => {
    const x = (i / N) * (W + 80) - 40;
    let top = baseY;
    for (const p of list) {
      const d = Math.abs(x - p.x) / p.w;
      const shape = p.y + (baseY - p.y) * Math.pow(d, p.k ?? 0.85);
      top = Math.min(top, shape);
    }
    // shoulders and steps down the slopes (none right at a summit, which
    // stays a clean point), and a crumpled edge, rougher where it's highest
    const fromTop = Math.min(1, Math.min(...list.map((p) => Math.abs(x - p.x))) / 90);
    const shoulders = (n(x / 75 + 40, 4) - 0.5) * 70 * fromTop;
    const rough = (n(x / 14, 5) - 0.5) * (top < 420 ? 16 : 10);
    return [x, Math.min(baseY + 40, top + shoulders + rough)];
  });
}

const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const fill = (pts) => `${line(pts)} L${W + 40} ${H + 40} L-40 ${H + 40} Z`;
const yAt = (pts, x) => pts.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];

// Snow in the gullies: short strokes running down the slope from the
// ridge, brighter and longer on the lit (left) faces and near the top
function gullies(seed, pts, from, to, summitX, strength) {
  const r = rng(seed);
  const out = [];
  for (const [x, y] of pts) {
    if (x < from || x > to || r() > 0.75) continue;
    const lit = x < summitX;
    const height = Math.max(0, 1 - (y - 230) / 420);
    const len = (30 + r() * 140) * (0.4 + height);
    // down and away from the summit, following the fall line
    const dx = (lit ? -1 : 1) * len * (0.25 + r() * 0.35);
    const o = (lit ? 0.16 : 0.06) * strength * (0.4 + height) * (0.5 + r() * 0.5);
    out.push(`<path d="M${x.toFixed(1)} ${(y + 2).toFixed(1)} q ${(dx * 0.4).toFixed(1)} ${(len * 0.5).toFixed(1)} ${dx.toFixed(1)} ${len.toFixed(1)}" stroke-opacity="${o.toFixed(3)}" stroke-width="${(0.6 + r() * 0.9).toFixed(2)}"/>`);
  }
  return out.join("");
}

const SUMMIT = { x: 520, y: 236 };
const everest = peaks(7, [
  { x: SUMMIT.x, y: SUMMIT.y, w: 460, k: 0.82 },
  { x: 705, y: 300, w: 330, k: 0.8 }, // Lhotse
  { x: 1030, y: 470, w: 420, k: 0.9 },
], 700);
const nuptse = peaks(13, [
  { x: 330, y: 392, w: 300, k: 0.75 },
  { x: 150, y: 470, w: 260, k: 0.9 },
], 760);

// the lit face of Everest: summit, down the left ridge, back up a fold
const summitAt = everest.findIndex(([x]) => x >= SUMMIT.x);
const leftRidge = everest.filter(([x]) => x > 250 && x <= SUMMIT.x);
const face = `${line(leftRidge)} L${SUMMIT.x - 60} 700 L${leftRidge[0][0] + 40} 700 Z`;

const stars = (() => {
  const r = rng(3);
  return Array.from({ length: 140 }, () => [r() * W, r() * 420, 0.35 + r() * 0.85, 0.06 + r() * 0.45]);
})();

const far1 = range(21, 610, 150, 260);
const far2 = range(34, 640, 170, 210);
const near1 = range(55, 800, 150, 240);
const near2 = range(89, 905, 120, 300);

const summitRidge = everest.slice(summitAt - 70, summitAt + 70);

const mist = (y, h, o) => `<rect x="-60" y="${y}" width="${W + 120}" height="${h}" fill="url(#mist)" opacity="${o}" filter="url(#haze)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.5}" height="${H * 1.5}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#02060f"/><stop offset="0.32" stop-color="#071528"/>
    <stop offset="0.52" stop-color="#11315a"/><stop offset="0.64" stop-color="#2a5d97"/><stop offset="0.72" stop-color="#1d4674"/><stop offset="1" stop-color="#081626"/>
  </linearGradient>
  <radialGradient id="dawn" cx="${SUMMIT.x}" cy="600" r="700" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#a9d0ff" stop-opacity="0.5"/><stop offset="0.3" stop-color="#5a9fea" stop-opacity="0.22"/><stop offset="1" stop-color="#4b95e6" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="far1" gradientUnits="userSpaceOnUse" x1="0" y1="450" x2="0" y2="700">
    <stop offset="0" stop-color="#3a6aa3"/><stop offset="1" stop-color="#26507f"/>
  </linearGradient>
  <linearGradient id="far2" gradientUnits="userSpaceOnUse" x1="0" y1="460" x2="0" y2="720">
    <stop offset="0" stop-color="#2b5688"/><stop offset="1" stop-color="#1b3e68"/>
  </linearGradient>
  <linearGradient id="rock" gradientUnits="userSpaceOnUse" x1="0" y1="${SUMMIT.y}" x2="0" y2="720">
    <stop offset="0" stop-color="#1c3a61"/><stop offset="0.55" stop-color="#13294a"/><stop offset="1" stop-color="#0d1e36"/>
  </linearGradient>
  <linearGradient id="lit" gradientUnits="userSpaceOnUse" x1="0" y1="${SUMMIT.y}" x2="0" y2="700">
    <stop offset="0" stop-color="#c9e0ff" stop-opacity="0.34"/><stop offset="0.45" stop-color="#6fa5e6" stop-opacity="0.12"/><stop offset="1" stop-color="#6fa5e6" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="wall" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="780">
    <stop offset="0" stop-color="#152f52"/><stop offset="1" stop-color="#0b182c"/>
  </linearGradient>
  <linearGradient id="near1" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="900">
    <stop offset="0" stop-color="#0d2038"/><stop offset="1" stop-color="#081427"/>
  </linearGradient>
  <linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="${SUMMIT.x - 300}" y1="0" x2="${SUMMIT.x + 300}" y2="0">
    <stop offset="0" stop-color="#4b95e6" stop-opacity="0"/><stop offset="0.35" stop-color="#8fc0ff" stop-opacity="0.75"/><stop offset="0.5" stop-color="#f2f7ff"/><stop offset="0.68" stop-color="#8fc0ff" stop-opacity="0.55"/><stop offset="1" stop-color="#4b95e6" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9cc6f7" stop-opacity="0"/><stop offset="0.5" stop-color="#9cc6f7" stop-opacity="1"/><stop offset="1" stop-color="#9cc6f7" stop-opacity="0"/>
  </linearGradient>
  <filter id="soft" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="haze" x="-10%" y="-80%" width="120%" height="260%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="far" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="0.8"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g fill="#e6f0ff">${stars.map(([x, y, r, o]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" opacity="${o.toFixed(2)}"/>`).join("")}</g>
<rect width="${W}" height="${H}" fill="url(#dawn)"/>

<path d="${fill(far1)}" fill="url(#far1)" filter="url(#far)"/>
${mist(560, 140, 0.35)}
<path d="${fill(far2)}" fill="url(#far2)"/>
${mist(610, 150, 0.28)}

<path d="${fill(everest)}" fill="url(#rock)"/>
<path d="${face}" fill="url(#lit)" filter="url(#soft)"/>
<g fill="none" stroke="#dbeaff" stroke-linecap="round">${gullies(101, everest, 250, 1250, SUMMIT.x, 1)}</g>
<path d="${line(summitRidge)}" fill="none" stroke="url(#edge)" stroke-width="7" opacity="0.45" filter="url(#soft)"/>
<path d="${line(summitRidge)}" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
${mist(640, 130, 0.22)}

<path d="${fill(nuptse)}" fill="url(#wall)"/>
<g fill="none" stroke="#dbeaff" stroke-linecap="round">${gullies(202, nuptse, 60, 560, 330, 0.7)}</g>
<path d="${line(nuptse.filter(([x]) => x > 40 && x < 620))}" fill="none" stroke="#8fbef5" stroke-opacity="0.22" stroke-width="1"/>
${mist(720, 120, 0.16)}

<path d="${fill(near1)}" fill="url(#near1)"/>
<path d="${fill(near2)}" fill="#050d1a"/>
</svg>`;

mkdirSync("public/start", { recursive: true });
const out = process.argv[2] ?? "public/start/everest.webp";
await sharp(Buffer.from(svg)).webp({ quality: 84 }).toFile(out);

// the stretch of ridge around the summit, for the page's glint
writeFileSync(
  "src/app/start/everestRidge.ts",
  `// Written by scripts/everest-scene.mjs: the ridge around the summit in\n// public/start/everest.webp (viewBox 0 0 ${W} ${H}), for the glint that travels it.\nexport const SCENE = { width: ${W}, height: ${H} };\nexport const SUMMIT_RIDGE = "${line(summitRidge)}";\n`
);
console.log("ok");
