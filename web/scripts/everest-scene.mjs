// The agreement page's backdrop (start/Shell.tsx): Everest before dawn,
// all in the app's blues. Drawn from numbers rather than a photograph, so
// it's ours and can be retuned: layered ranges that pale into the mist
// with distance, a sky lightening at the horizon, and Everest in the left
// third, where the page's left panel looks onto it, Lhotse beside it and
// Nuptse's wall in front, their snow picked out in fine gullies.
//
//   node scripts/everest-scene.mjs
//
// Writes public/start/everest.svg (the scene, stars and all, a vector file
// sharp at any size and zoom, with no filters heavy enough to stall a
// redraw), public/start/grain.png (the page's grain) and
// src/app/start/everestRidge.ts (the summit, its ridge line and the stars
// the page twinkles).
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
    const shoulders = (n(x / 75 + 40, 4) - 0.5) * 70 * fromTop + (n(x / 28 + 90, 4) - 0.5) * 30 * fromTop;
    const rough = (n(x / 14, 5) - 0.5) * (top < 420 ? 16 : 10) + (n(x / 5 + 7, 3) - 0.5) * 5;
    return [x, Math.min(baseY + 40, top + shoulders + rough)];
  });
}

const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const fill = (pts) => `${line(pts)} L${W + 40} ${H + 40} L-40 ${H + 40} Z`;
const yAt = (pts, x) => pts.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];

// Snow in the couloirs: many short marks scattered over the faces below
// the ridge, running down the fall line, densest and brightest near the
// top and on the lit (left) faces, thinning with depth
function gullies(seed, pts, from, to, summitX, strength) {
  const r = rng(seed);
  const out = [];
  for (const [x, y] of pts) {
    if (x < from || x > to) continue;
    const lit = x < summitX;
    const height = Math.max(0, 1 - (y - 230) / 420);
    const marks = Math.round((lit ? 3 : 1.5) * (0.4 + height) * strength);
    for (let m = 0; m < marks; m++) {
      const depth = r() * r();
      const sy = y + 4 + depth * 260;
      const sx = x + (r() - 0.5) * 10 + (lit ? -1 : 1) * depth * 60;
      const len = (8 + r() * 34) * (1 - depth * 0.6);
      const dx = (lit ? -1 : 1) * len * (0.2 + r() * 0.35);
      const bend = (r() - 0.5) * len * 0.35;
      const o = (lit ? 0.2 : 0.07) * strength * (0.35 + height) * (1 - depth) * (0.5 + r() * 0.5);
      if (o < 0.012) continue;
      out.push(
        `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} q ${(dx * 0.5 + bend).toFixed(1)} ${(len * 0.5).toFixed(1)} ${dx.toFixed(1)} ${len.toFixed(1)}" stroke-opacity="${o.toFixed(3)}" stroke-width="${(0.5 + r() * 1.1).toFixed(2)}"/>`
      );
    }
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
// the fold between the lit face and the shade wanders down, not straight
const foldPts = (() => {
  const n = noise(501);
  return Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return [SUMMIT.x - 60 * t + (n(i / 3) - 0.5) * 34 * t, SUMMIT.y + (720 - SUMMIT.y) * t];
  });
})();
const face = `${line(leftRidge)} ${foldPts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} L${leftRidge[0][0] + 40} 700 Z`;

// the faces turned from the light: from the fold (where the lit face
// ends) across to the right ridge, for Everest and for Lhotse
const wander = (seed, x0, y0, drift) => {
  const n = noise(seed);
  return Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return [x0 + drift * t + (n(i / 3) - 0.5) * 34 * t, y0 + (720 - y0) * t];
  });
};
const toPath = (pts) => pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
// the lowest point of the ridge between two x's: where one face ends
const saddle = (from, to) => everest.filter(([x]) => x > from && x < to).reduce((a, b) => (b[1] > a[1] ? b : a));
const lhotseTop = everest.filter(([x]) => x > 660 && x < 760).reduce((a, b) => (b[1] < a[1] ? b : a));
const col = saddle(SUMMIT.x + 20, lhotseTop[0] - 20);
const shadowFace = `${line(everest.filter(([x]) => x >= SUMMIT.x && x <= col[0]))} ${toPath(wander(503, col[0], col[1], 40))} ${toPath([...foldPts].reverse())} Z`;
const lhotseEnd = saddle(lhotseTop[0] + 40, 1000);
const lhotseShadow = `${line(everest.filter(([x]) => x >= lhotseTop[0] && x <= lhotseEnd[0]))} ${toPath(wander(504, lhotseEnd[0], lhotseEnd[1], 30))} ${toPath(wander(502, lhotseTop[0], lhotseTop[1], -30).reverse())} Z`;

const far1 = range(21, 610, 150, 260);
const far2 = range(34, 640, 170, 210);
const near1 = range(55, 800, 150, 240);
const near2 = range(89, 905, 120, 300);

// the skyline: the highest land at each x (every range shares the x's)
const skyline = everest.map((_, i) => Math.min(...[far1, far2, everest, nuptse, near1, near2].map((pts) => pts[i][1])));
const skyAt = (x) => skyline[Math.max(0, Math.min(N, Math.round(((x + 40) / (W + 80)) * N)))];

// A clear night sky: fine stars, blue-white and a few warm, a scatter of
// brighter ones and a few that shine; none on a mountain, and dimming into
// the glow near the horizon
const stars = (() => {
  const r = rng(29);
  const out = [];
  for (let i = 0; i < 1400; i++) {
    const x = r() * W;
    const y = r() * 620;
    const k = r();
    const room = skyAt(x) - y;
    const tint = r() < 0.12 ? "#ffe8d0" : r() < 0.45 ? "#d4e3ff" : "#ffffff";
    if (room < 8) continue;
    const rad = k < 0.86 ? 0.4 + r() * 0.45 : k < 0.97 ? 0.8 + r() * 0.5 : 1.2 + r() * 0.5;
    const o = (k < 0.86 ? 0.3 + r() * 0.45 : 0.65 + r() * 0.35) * Math.min(1, room / 180);
    out.push({ x, y, rad, o, tint });
  }
  return out;
})();
// the ones that twinkle on the page, from the brighter stars in the upper
// sky; the page draws them, so the scene leaves them out
const twinkles = stars.filter((s) => s.rad > 0.75 && s.y < 420).slice(0, 36);
const still = stars.filter((s) => !twinkles.includes(s));

const summitRidge = everest.slice(summitAt - 70, summitAt + 70);

// a band of haze (soft by its own gradient: no blur to redraw on zoom)
const mist = (y, h, o) => `<rect x="-60" y="${y}" width="${W + 120}" height="${h}" fill="url(#mist)" opacity="${o}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.5}" height="${H * 1.5}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#02060f"/><stop offset="0.32" stop-color="#071528"/>
    <stop offset="0.52" stop-color="#11315a"/><stop offset="0.64" stop-color="#2a5d97"/><stop offset="0.72" stop-color="#1d4674"/><stop offset="1" stop-color="#081626"/>
  </linearGradient>
  <radialGradient id="warm" cx="240" cy="470" r="620" gradientTransform="translate(0 367.2) scale(1 0.22)" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffc49a" stop-opacity="0.42"/><stop offset="0.4" stop-color="#e59c80" stop-opacity="0.14"/><stop offset="1" stop-color="#f0a57e" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="shade" gradientUnits="userSpaceOnUse" x1="0" y1="${SUMMIT.y}" x2="0" y2="720">
    <stop offset="0" stop-color="#030812" stop-opacity="0.2"/><stop offset="1" stop-color="#030812" stop-opacity="0"/>
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
    <stop offset="0" stop-color="#d6e8ff" stop-opacity="0.42"/><stop offset="0.45" stop-color="#6fa5e6" stop-opacity="0.14"/><stop offset="1" stop-color="#6fa5e6" stop-opacity="0"/>
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
  <filter id="soft" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.5"/></filter>
  <filter id="lit-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
  <radialGradient id="shine"><stop offset="0" stop-color="#dfe9ff" stop-opacity="0.5"/><stop offset="0.35" stop-color="#9fc0ff" stop-opacity="0.16"/><stop offset="1" stop-color="#9fc0ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g>${still.map((t) => `<circle cx="${t.x.toFixed(0)}" cy="${t.y.toFixed(0)}" r="${t.rad.toFixed(2)}" fill="${t.tint}" opacity="${t.o.toFixed(2)}"/>`).join("")}</g>
${stars.filter((t) => t.rad > 1.3 && t.o > 0.75).slice(0, 5).map((t) => `<circle cx="${t.x.toFixed(0)}" cy="${t.y.toFixed(0)}" r="9" fill="url(#shine)"/>`).join("")}
<rect width="${W}" height="${H}" fill="url(#dawn)"/>
<rect width="${W}" height="${H}" fill="url(#warm)"/>

<path d="${fill(far1)}" fill="url(#far1)"/>
${mist(560, 140, 0.3)}
<path d="${fill(far2)}" fill="url(#far2)"/>
${mist(610, 150, 0.24)}

<path d="${fill(everest)}" fill="url(#rock)"/>
<path d="${face}" fill="url(#lit)" filter="url(#lit-soft)"/>
<g fill="none" stroke="#dbeaff" stroke-linecap="round">${gullies(101, everest, 250, 1250, SUMMIT.x, 0.85)}</g>
<!-- first light along the summit ridge: a thin line, brightest at the top and fading out down both sides -->
<path d="${line(summitRidge)}" fill="none" stroke="url(#edge)" stroke-width="3" opacity="0.35" filter="url(#soft)"/>
<path d="${line(summitRidge)}" fill="none" stroke="url(#edge)" stroke-width="1.1" stroke-linejoin="round"/>
${mist(640, 130, 0.2)}

<path d="${fill(nuptse)}" fill="url(#wall)"/>
<g fill="none" stroke="#dbeaff" stroke-linecap="round">${gullies(202, nuptse, 60, 560, 330, 0.6)}</g>
<path d="${line(nuptse.filter(([x]) => x > 40 && x < 620))}" fill="none" stroke="#8fbef5" stroke-opacity="0.22" stroke-width="0.8"/>
${mist(720, 120, 0.14)}

<path d="${fill(near1)}" fill="url(#near1)"/>
<path d="${fill(near2)}" fill="#050d1a"/>
</svg>`;

mkdirSync("public/start", { recursive: true });
// numbers to one decimal: the same picture, a lighter file
const tidy = (svgText) => svgText.replace(/(\d+\.\d)\d+/g, "$1");
// high quality: smooth skies band at the usual settings
writeFileSync("public/start/everest.svg", tidy(svg));

// Grain, laid over the page as a small repeating tile: it keeps the
// gradients from banding, and a bitmap tile costs nothing to redraw on zoom
const G = 160;
const gr = rng(5);
const grain = Buffer.alloc(G * G * 4);
for (let i = 0; i < G * G; i++) {
  const v = gr() < 0.5 ? 0 : 255;
  grain.fill(v, i * 4, i * 4 + 3);
  grain[i * 4 + 3] = Math.round(gr() * 12);
}
await sharp(grain, { raw: { width: G, height: G, channels: 4 } }).png({ compressionLevel: 9 }).toFile("public/start/grain.png");

// the stretch of ridge around the summit, for the page's glint, and its top
const top = summitRidge.reduce((a, b) => (b[1] < a[1] ? b : a));
writeFileSync(
  "src/app/start/everestRidge.ts",
  `// Written by scripts/everest-scene.mjs: the ridge around the summit in\n// public/start/everest.svg (viewBox 0 0 ${W} ${H}), for the glint that travels it.\nexport const SCENE = { width: ${W}, height: ${H} };\nexport const SUMMIT = { x: ${top[0].toFixed(1)}, y: ${top[1].toFixed(1)} };\nexport const SUMMIT_RIDGE = "${line(summitRidge)}";\n// bright stars in the scene, for the page to twinkle: x, y, radius\nexport const TWINKLES: [number, number, number][] = ${JSON.stringify(twinkles.map((t) => [Math.round(t.x), Math.round(t.y), +t.rad.toFixed(2)]))};\n`
);
console.log("ok");
