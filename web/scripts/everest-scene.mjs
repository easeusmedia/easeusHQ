// The agreement page's backdrop (start/Shell.tsx): Everest before dawn,
// all in the app's blues. Drawn from numbers rather than a photograph, so
// it's ours and can be retuned: layered ranges that pale into the mist
// with distance, a sky lightening at the horizon, and Everest in the left
// third, where the page's left panel looks onto it, Lhotse beside it and
// Nuptse's wall in front, their snow picked out in fine gullies.
//
//   node scripts/everest-scene.mjs
//
// Writes vector files the page draws at whatever size and zoom it's shown
// at (public/start/everest.svg, the scene; everest-galaxy.svg, the Milky
// Way the page turns; everest-sky.png, the sky's shape, which keeps the
// stars off the mountains) and src/app/start/everestRidge.ts (the
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

const stars = (() => {
  const r = rng(3);
  return Array.from({ length: 90 }, () => [r() * W, r() * 380, 0.3 + r() * 0.7, 0.04 + r() * 0.28]);
})();

const far1 = range(21, 610, 150, 260);
const far2 = range(34, 640, 170, 210);
const near1 = range(55, 800, 150, 240);
const near2 = range(89, 905, 120, 300);

const summitRidge = everest.slice(summitAt - 70, summitAt + 70);

// a band of haze, and wisps of fog drifting through it
const mist = (y, h, o) =>
  `<rect x="-60" y="${y}" width="${W + 120}" height="${h}" fill="url(#mist)" opacity="${(o * 0.6).toFixed(2)}" filter="url(#haze)"/>` +
  `<rect x="-60" y="${y - h * 0.2}" width="${W + 120}" height="${h * 1.4}" fill="#fff" filter="url(#fog)" mask="url(#fogfade)" opacity="${o.toFixed(2)}"/>`;
// the grain of rock inside a shape: pale streaks, and darker weathering
const tex = (d, light) => `<path d="${d}" fill="#fff" filter="url(#rocktex)" opacity="${light}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.5}" height="${H * 1.5}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#02060f"/><stop offset="0.32" stop-color="#071528"/>
    <stop offset="0.52" stop-color="#11315a"/><stop offset="0.64" stop-color="#2a5d97"/><stop offset="0.72" stop-color="#1d4674"/><stop offset="1" stop-color="#081626"/>
  </linearGradient>
  <radialGradient id="warm" cx="260" cy="500" r="820" gradientTransform="translate(0 375) scale(1 0.25)" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f4ad7d" stop-opacity="0.5"/><stop offset="0.4" stop-color="#d9947a" stop-opacity="0.2"/><stop offset="1" stop-color="#d9947a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="shade" gradientUnits="userSpaceOnUse" x1="0" y1="${SUMMIT.y}" x2="0" y2="720">
    <stop offset="0" stop-color="#030812" stop-opacity="0.36"/><stop offset="1" stop-color="#030812" stop-opacity="0.08"/>
  </linearGradient>
  <!-- rock: streaks running down the slopes, kept inside each shape -->
  <filter id="rocktex" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.014 0.022" numOctaves="5" seed="9"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.74  0 0 0 0 0.95  0 0 0 -2.4 1.3"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="rockdark" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.004" numOctaves="4" seed="21"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.01  0 0 0 0 0.03  0 0 0 0 0.07  0 0 0 -1.8 1.05"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <!-- mist that drifts in wisps rather than lying in a band -->
  <filter id="fog" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.018" numOctaves="4" seed="4"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.76  0 0 0 0 0.96  0 0 0 1.6 -0.55"/>
  </filter>
  <linearGradient id="fogband" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="fogfade" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#fogband)"/></mask>
  <radialGradient id="dawn" cx="${SUMMIT.x}" cy="600" r="700" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#a9d0ff" stop-opacity="0.5"/><stop offset="0.3" stop-color="#5a9fea" stop-opacity="0.22"/><stop offset="1" stop-color="#4b95e6" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="far1" gradientUnits="userSpaceOnUse" x1="0" y1="450" x2="0" y2="700">
    <stop offset="0" stop-color="#2a4d78"/><stop offset="1" stop-color="#1b3a5f"/>
  </linearGradient>
  <linearGradient id="far2" gradientUnits="userSpaceOnUse" x1="0" y1="460" x2="0" y2="720">
    <stop offset="0" stop-color="#1f3f66"/><stop offset="1" stop-color="#142e4f"/>
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
  <filter id="lit-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="snow-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.9"/></filter>
  <filter id="haze" x="-10%" y="-80%" width="120%" height="260%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="far" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="0.8"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g fill="#e6f0ff">${stars.map(([x, y, r, o]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" opacity="${o.toFixed(2)}"/>`).join("")}</g>
<rect width="${W}" height="${H}" fill="url(#dawn)"/>

<rect width="${W}" height="${H}" fill="url(#warm)"/>
<path d="${fill(far1)}" fill="url(#far1)" filter="url(#far)"/>
${tex(fill(far1), 0.05)}
${mist(560, 140, 0.35)}
<path d="${fill(far2)}" fill="url(#far2)"/>
${tex(fill(far2), 0.06)}
${mist(610, 150, 0.28)}

<path d="${fill(everest)}" fill="url(#rock)"/>
${tex(fill(everest), 0.08)}
<path d="${face}" fill="url(#lit)" filter="url(#lit-soft)"/>
<path d="${shadowFace}" fill="url(#shade)"/>
<path d="${lhotseShadow}" fill="url(#shade)"/>
<g fill="none" stroke="#dbeaff" stroke-linecap="round" filter="url(#snow-soft)">${gullies(101, everest, 250, 1250, SUMMIT.x, 1)}</g>
${mist(640, 130, 0.22)}

<path d="${fill(nuptse)}" fill="url(#wall)"/>
${tex(fill(nuptse), 0.06)}
<g fill="none" stroke="#dbeaff" stroke-linecap="round" filter="url(#snow-soft)">${gullies(202, nuptse, 60, 560, 330, 0.7)}</g>
${mist(720, 120, 0.16)}

<path d="${fill(near1)}" fill="url(#near1)"/>
${tex(fill(near1), 0.04)}
<path d="${fill(near2)}" fill="#050d1a"/>
<rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)" opacity="0.09" style="mix-blend-mode:overlay"/>
</svg>`;

mkdirSync("public/start", { recursive: true });
// numbers to one decimal: the same picture, a lighter file
const tidy = (svgText) => svgText.replace(/(\d+\.\d)\d+/g, "$1");
// high quality: smooth skies band at the usual settings
writeFileSync("public/start/everest.svg", tidy(svg));

// the sky's shape (white) against the land (black), for the page's stars,
// which move and must never cross a mountain
const land = [far1, far2, everest, nuptse, near1, near2].map((pts) => `<path d="${fill(pts)}" fill="#000"/>`).join("");
const skySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W / 2}" height="${H / 2}"><rect width="${W}" height="${H}" fill="#fff"/>${land}</svg>`;
// as a CSS mask: opaque sky, clear land
const skyAlpha = await sharp(Buffer.from(skySvg)).blur(1.2).greyscale().raw().toBuffer({ resolveWithObject: true });
const px = skyAlpha.info.width * skyAlpha.info.height;
const rgba = Buffer.alloc(px * 4, 255);
for (let i = 0; i < px; i++) rgba[i * 4 + 3] = skyAlpha.data[i * skyAlpha.info.channels];
await sharp(rgba, { raw: { width: skyAlpha.info.width, height: skyAlpha.info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile("public/start/everest-sky.png");

// The Milky Way, on its own (transparent) so the page can turn it slowly
// across the sky: a band of star clouds in blue and violet, a darker dust
// lane down its middle, and thousands of faint stars thickest along it.
// Drawn larger than the picture (GX by GY, the picture at its middle) so
// turning never shows an edge.
const GX = 2400;
const GY = 1600;
const galaxy = (() => {
  const r = rng(17);
  const gauss = () => (r() + r() + r() + r() + r() + r() - 3) / 3;
  // the band bends gently; `mid(x)` is its centre line
  const mid = (x) => GY / 2 + Math.sin((x / GX) * Math.PI * 1.3) * 40;
  const core = GX * 0.34; // the bright heart of it
  const glow = (x) => 0.55 + 0.45 * Math.exp(-(((x - core) / (GX * 0.16)) ** 2));
  const stars = [];
  for (let i = 0; i < 4200; i++) {
    const inBand = i < 3200;
    const x = r() * GX * 1.1 - GX * 0.05;
    const across = gauss() * (inBand ? 150 * glow(x) : 420);
    const bright = r() < 0.03;
    const o = (inBand ? 0.18 + r() * 0.5 : 0.08 + r() * 0.3) * (inBand ? glow(x) : 1);
    stars.push(`<circle cx="${x.toFixed(0)}" cy="${(mid(x) + across).toFixed(1)}" r="${(bright ? 0.9 + r() * 0.7 : 0.3 + r() * 0.55).toFixed(2)}" opacity="${Math.min(1, bright ? o + 0.4 : o).toFixed(2)}"/>`);
  }
  // star clouds: many soft blobs of differing size and tint, thickest at the core
  const clouds = Array.from({ length: 70 }, () => {
    const x = r() * GX;
    const g = glow(x);
    const w = (60 + r() * 220) * (0.7 + g * 0.6);
    const h = (30 + r() * 80) * (0.7 + g * 0.5);
    const warm = Math.abs(x - core) < GX * 0.1 && r() < 0.5;
    const c = warm ? "#ffe0c2" : r() < 0.35 ? "#b9adff" : "#9cc2ff";
    return `<ellipse cx="${x.toFixed(0)}" cy="${(mid(x) + gauss() * 90).toFixed(0)}" rx="${w.toFixed(0)}" ry="${h.toFixed(0)}" fill="${c}" opacity="${((0.03 + r() * 0.07) * g * 1.4).toFixed(3)}"/>`;
  }).join("");
  // dust: dark patches drifting along the middle, not one stripe
  const dust = Array.from({ length: 34 }, () => {
    const x = r() * GX;
    return `<ellipse cx="${x.toFixed(0)}" cy="${(mid(x) + (r() - 0.5) * 60).toFixed(0)}" rx="${(40 + r() * 140).toFixed(0)}" ry="${(8 + r() * 22).toFixed(0)}" fill="#010308" opacity="${(0.15 + r() * 0.25).toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GX} ${GY}" width="${GX}" height="${GY}">
<defs><filter id="neb" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="dust" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="18"/></filter></defs>
<g transform="rotate(-24 ${GX / 2} ${GY / 2})">
  <g filter="url(#neb)">${clouds}</g>
  <g fill="#f2f5ff">${stars.join("")}</g>
  <g filter="url(#dust)">${dust}</g>
</g>
</svg>`;
})();
writeFileSync("public/start/everest-galaxy.svg", tidy(galaxy));

// the stretch of ridge around the summit, for the page's glint, and its top
const top = summitRidge.reduce((a, b) => (b[1] < a[1] ? b : a));
writeFileSync(
  "src/app/start/everestRidge.ts",
  `// Written by scripts/everest-scene.mjs: the ridge around the summit in\n// public/start/everest.svg (viewBox 0 0 ${W} ${H}), for the glint that travels it.\nexport const SCENE = { width: ${W}, height: ${H} };\nexport const SUMMIT = { x: ${top[0].toFixed(1)}, y: ${top[1].toFixed(1)} };\nexport const SUMMIT_RIDGE = "${line(summitRidge)}";\n// public/start/everest-galaxy.svg, drawn larger than the picture and centred on it\nexport const GALAXY = { width: ${GX}, height: ${GY} };\n`
);
console.log("ok");
