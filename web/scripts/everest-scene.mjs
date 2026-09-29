// The agreement page's backdrop (start/Shell.tsx): Everest at night, in the
// app's blues. One peak lit hard from the upper left, its snow face bright
// and carved into fine flutes, its far face in shadow; lower ridges in
// front of it, mist at its foot, a black rocky ridge in the foreground, and
// a quiet sky with a few stars. Drawn from numbers rather than a
// photograph, so it's ours and can be retuned: each ridge is a silhouette
// with a surface behind it (a steep tent from each summit, grooved along
// the fall line by noise), shaded by the light and toned down a blue ramp.
//
//   node scripts/everest-scene.mjs          (SCALE=0.75 for a quick look)
//
// Writes public/start/everest.webp (large enough for a retina screen, with
// a hint of dither so the sky never bands), public/start/grain.png (the
// page's grain) and src/app/start/everestRidge.ts (the summit, its ridge
// line and the stars the page twinkles).
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1600;
const H = 1000;
const S = Number(process.env.SCALE ?? 1.8);
const PW = Math.round(W * S);
const PH = Math.round(H * S);
const OUT = process.env.OUT ?? "public/start/everest.webp";
// the land sits this far down the frame: sky above the peak for the
// message on its summit
const DY = 60;

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

// 2D gradient noise, about -0.7..0.7
function perlin(seed) {
  const r = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = p[p[X] + Y];
    const b = p[p[X + 1] + Y];
    const c = p[p[X] + Y + 1];
    const d = p[p[X + 1] + Y + 1];
    const n00 = gx[a] * xf + gy[a] * yf;
    const n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1);
    const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const top = n00 + (n10 - n00) * u;
    return top + (n01 + (n11 - n01) * u - top) * v;
  };
}
// cells: the distance to the nearest of a scatter of points, 0..~1. As a
// surface: flat facets meeting in sharp crests, like broken rock and ice
function cells(seed) {
  const h = (i, j) => {
    let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 144269)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = 9;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i;
        const cy = yi + j;
        const d = Math.hypot(cx + h(cx, cy) - x, cy + h(cy + 71, cx - 13) - y);
        if (d < f1) f1 = d;
      }
    }
    return f1;
  };
}
const fbm = (n, x, y, oct) => {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += n(x * f + o * 31.7, y * f - o * 17.3) * amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return s;
};
// crests: sharp ridges, soft hollows, 0..1
const ridged = (n, x, y, oct) => {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const v = 1 - Math.abs(n(x * f + o * 13.1, y * f + o * 7.9)) * 1.6;
    s += v * v * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.13;
  }
  return s / norm;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(stops) {
  const s = stops.map(([t, h]) => [t, hex(h)]);
  return (v) => {
    v = clamp(v);
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) return mix(s[i - 1][1], s[i][1], (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
    }
    return s[s.length - 1][1];
  };
}

// snow and rock by moonlight, from shadow to the brightest snow
const tone = ramp([
  [0, "#03060c"],
  [0.16, "#08121f"],
  [0.34, "#132842"],
  [0.52, "#284e80"],
  [0.68, "#4f86c8"],
  [0.82, "#9cc2ee"],
  [1, "#f1f6ff"],
]);

const img = new Float32Array(PW * PH * 3);
const put = (i, c, a = 1) => {
  img[i * 3] += (c[0] - img[i * 3]) * a;
  img[i * 3 + 1] += (c[1] - img[i * 3 + 1]) * a;
  img[i * 3 + 2] += (c[2] - img[i * 3 + 2]) * a;
};

// the light: from the upper left, a little in front
const L = (() => {
  const v = [-0.78, -0.42, 0.52];
  const m = Math.hypot(...v);
  return v.map((c) => c / m);
})();

// and a faint fill from the upper right, so faces in shadow keep their shape
const F = (() => {
  const v = [0.7, -0.55, 0.45];
  const m = Math.hypot(...v);
  return v.map((c) => c / m);
})();

const SUMMIT = { x: 520, y: 205 };

// 1. The sky: near black at the top, a deep blue toward the horizon, and a
// soft light behind the peak
const skyTop = hex("#02040a");
const skyLow = hex("#0a1628");
const glow = hex("#16305a");
for (let py = 0; py < PH; py++) {
  const y = py / S - DY;
  const base = mix(skyTop, skyLow, smooth(-DY, 640, y));
  for (let px = 0; px < PW; px++) {
    const x = px / S;
    const d = Math.hypot((x - SUMMIT.x) / 1.25, y - (SUMMIT.y + 260)) / 620;
    const c = mix(base, glow, 0.55 * Math.pow(clamp(1 - d), 2.2));
    const i = py * PW + px;
    img[i * 3] = c[0];
    img[i * 3 + 1] = c[1];
    img[i * 3 + 2] = c[2];
  }
}

// a few stars, faint, only in the upper sky
const stars = (() => {
  const r = rng(29);
  const out = [];
  for (let i = 0; i < 150; i++) {
    const x = r() * W;
    const y = r() * r() * 520;
    const k = r();
    out.push({ x, y, rad: k < 0.9 ? 0.45 + r() * 0.35 : 0.8 + r() * 0.4, o: (k < 0.9 ? 0.25 + r() * 0.35 : 0.6 + r() * 0.3) * (1 - y / 700), warm: r() < 0.15 });
  }
  return out;
})();
const twinkles = stars.filter((s) => s.rad > 0.75 && s.y < 380).slice(0, 12);
for (const s of stars) {
  if (twinkles.includes(s)) continue;
  const c = s.warm ? hex("#ffe6cc") : hex("#dde8ff");
  const R = Math.ceil(s.rad * S * 2.5);
  const cx = s.x * S;
  const cy = (s.y + DY) * S;
  for (let py = Math.floor(cy - R); py <= cy + R; py++) {
    for (let px = Math.floor(cx - R); px <= cx + R; px++) {
      if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) / (s.rad * S);
      put(py * PW + px, c, s.o * Math.exp(-d * d * 1.4));
    }
  }
}

// A ridge: a silhouette (top(x), in picture units) with a surface behind
// it. Each summit raises a steep tent whose crest (the arete) wanders down
// from it; where tents meet, the nearer surface wins, which carves the
// valleys between peaks. Noise grooves the faces along the fall line: big
// spurs, finer flutes, and grit.
function ridge({ seed, peaks, top, kx = 1.25, ky = 0.35, spurs = 14, flutes = 3.2, grit = 0.5, scale = 1, stretch = 1, fall = 0.85, shade, fog }) {
  const c1 = cells(seed);
  const n2 = perlin(seed + 1);
  const n3 = perlin(seed + 2);
  const nw = perlin(seed + 3);
  const tops = new Float32Array(PW + 2);
  for (let px = -1; px <= PW; px++) tops[px + 1] = top((px + 0.5) / S);
  let minTop = Infinity;
  for (const t of tops) minTop = Math.min(minTop, t);
  const y0 = Math.max(0, Math.floor((minTop + DY) * S) - 2);
  const rows = PH - y0;
  // the surface, in picture units toward the eye
  const D = new Float32Array(PW * rows);
  const cav = new Float32Array(PW * rows);
  // the grooves on their own, without the tent: lit as if the face were
  // flat, they show the texture in the shadowed faces
  const R = new Float32Array(PW * rows);
  const arete = peaks.map((p) => {
    const n = perlin(seed + 11 + p.x);
    return (y) => {
      const f = Math.max(0, y - p.y);
      return p.x + (p.drift ?? 0.5) * f + (p.bow ?? 0.0015) * f * f + n(y / 110, 0.5) * 40 * clamp(f / 220);
    };
  });
  for (let r = 0; r < rows; r++) {
    const y = (y0 + r) / S - DY;
    const ax = arete.map((a) => a(y));
    for (let px = 0; px < PW; px++) {
      const x = (px + 0.5) / S;
      let best = -Infinity;
      let side = 1;
      for (let k = 0; k < peaks.length; k++) {
        const p = peaks[k];
        // a buttress sinks back into the face as it falls
        const d = -(p.kx ?? kx) * Math.abs(x - ax[k]) + ky * (y - p.y) + (p.z ?? 0) - (p.sink ?? 0) * Math.max(0, y - p.y);
        if (d > best) {
          best = d;
          side = x < ax[k] ? -1 : 1;
        }
      }
      // grooves down the fall line: down and away from the crest
      const fx = side * fall;
      const fy = 1;
      const m = Math.hypot(fx, fy);
      const warp = fbm(nw, x / 170, y / 170, 3) * 44 + fbm(nw, x / 38 + 9, y / 38, 2) * 9;
      const u = ((x * fy - y * fx) / m + warp) / scale;
      const v = (x * fx + y * fy) / m / scale;
      const r1 = c1(u / 62, v / (190 * stretch)) * 0.65 + c1(u / 24 + 40, v / (80 * stretch)) * 0.35;
      const r2 = ridged(n2, u / 15, v / (190 * stretch), 3);
      const g = fbm(n3, x / 3, y / 3, 2);
      // carved in places, smooth snowfields in others
      const patch = 0.3 + 1.2 * smooth(-0.18, 0.22, fbm(nw, x / 230 + 5, y / 230 + 5, 2));
      const relief = spurs * r1 * (0.6 + 0.4 * patch) + flutes * r2 * patch + grit * g;
      D[r * PW + px] = best + relief;
      R[r * PW + px] = relief;
      cav[r * PW + px] = r1 * 0.5 + r2 * 0.5;
    }
  }
  // light blocked by the surface itself: march toward the light and see
  // whether the ground rises above the ray (a little soft at the edge)
  const lxy = Math.hypot(L[0], L[1]);
  const sdx = L[0] / lxy;
  const sdy = L[1] / lxy;
  const rise = L[2] / lxy / S;
  const shadowAt = (px, r) => {
    const d0 = D[r * PW + px];
    let most = -Infinity;
    for (let t = 1.5; t < 150 * S; t += 1 + t * 0.06) {
      const qx = Math.round(px + sdx * t);
      const qr = Math.round(r + sdy * t);
      if (qx < 0 || qx >= PW || qr < 0) break;
      if (y0 + qr < (tops[qx + 1] + DY) * S) break;
      most = Math.max(most, D[qr * PW + qx] - d0 - rise * t);
    }
    return smooth(-0.4, 1.6, most);
  };
  for (let r = 0; r < rows; r++) {
    const py = y0 + r;
    const y = py / S - DY;
    for (let px = 0; px < PW; px++) {
      const t0 = tops[px + 1];
      const slope = (tops[px + 2] - tops[px]) / 2;
      // coverage across the edge, measured square to it: smooth at any angle
      const dist = ((y + 0.5 / S - t0) * S) / Math.sqrt(1 + slope * slope);
      const cover = clamp(dist + 0.5);
      if (cover <= 0) continue;
      const i = r * PW + px;
      const xl = px > 0 ? D[i - 1] : D[i];
      const xr = px < PW - 1 ? D[i + 1] : D[i];
      const yu = r > 0 ? D[i - PW] : D[i];
      const yd = r < rows - 1 ? D[i + PW] : D[i];
      const dx = ((xr - xl) * S) / 2;
      const dy = ((yd - yu) * S) / 2;
      const m = Math.hypot(dx, dy, 1);
      const lam = (-dx * L[0] - dy * L[1] + L[2]) / m;
      const fill = clamp((-dx * F[0] - dy * F[1] + F[2]) / m);
      const rx = (((px < PW - 1 ? R[i + 1] : R[i]) - (px > 0 ? R[i - 1] : R[i])) * S) / 2;
      const ry = (((r < rows - 1 ? R[i + PW] : R[i]) - (r > 0 ? R[i - PW] : R[i])) * S) / 2;
      const detail = clamp((-rx * L[0] - ry * L[1] + L[2]) / Math.hypot(rx, ry, 1));
      const x = (px + 0.5) / S;
      const c = shade({ lam, fill, detail, sh: shadowAt(px, r), cav: cav[i], x, y, below: y - t0 });
      const f = fog ? fog({ x, y, below: y - t0 }) : null;
      put(py * PW + px, f ? mix(c, f.color, f.amount) : c, cover);
    }
  }
}

// Silhouettes from hand-placed points (x, y), joined smoothly and then
// crumpled: notches and steps along the crest, calm right at a summit
function outline(seed, pts, rough = 1, calm = []) {
  const n = perlin(seed);
  return (x) => {
    let i = 1;
    while (i < pts.length - 1 && pts[i][0] < x) i++;
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const t = clamp((x - x0) / (x1 - x0));
    const base = y0 + (y1 - y0) * (t * t * (3 - 2 * t) * 0.5 + t * 0.5);
    const still = calm.reduce((m, c) => Math.min(m, clamp(Math.abs(x - c) / 60)), 1);
    const steps = (ridged(n, x / 70, 0.5, 3) - 0.45) * 18 + n(x / 20, 3.3) * 6 + n(x / 5, 8.1) * 1.8;
    return base + steps * rough * (0.25 + 0.75 * still);
  };
}

const fogAt = (color, from, to, most) => ({ y }) => ({ color, amount: most * smooth(from, to, y) });

// 2. Distant ranges, low along the horizon, pale in the haze
const farTop = outline(41, [[-40, 520], [120, 470], [260, 500], [700, 520], [900, 470], [1000, 450], [1090, 400], [1200, 460], [1320, 420], [1460, 460], [1640, 440]], 1.1);
ridge({
  seed: 40,
  peaks: [{ x: 120, y: 470, drift: 0.7 }, { x: 1090, y: 400, drift: 0.7 }, { x: 1320, y: 420, drift: 0.7 }, { x: 1600, y: 440, drift: 0.7 }],
  top: farTop,
  kx: 1.1,
  spurs: 12,
  flutes: 1.5,
  shade: ({ lam, sh }) => tone(0.14 + 0.36 * smooth(0.3, 1, lam * (1 - sh))),
  fog: ({ y }) => ({ color: hex("#15243f"), amount: 0.62 + 0.3 * smooth(440, 620, y) }),
});

// 3. Everest: one broad, steep peak with a stepped west ridge, and Lhotse
// lower off its right shoulder
const everestTop = outline(7, [
  [-40, 640], [90, 590], [200, 520], [270, 470], [320, 452], [370, 400], [420, 330], [468, 262], [520, 200],
  [560, 236], [610, 282], [660, 318], [705, 332], [750, 306], [790, 282], [830, 312], [900, 372], [1000, 430], [1140, 480], [1300, 520], [1640, 560],
], 1, [520, 790]);
ridge({
  seed: 7,
  peaks: [
    { x: SUMMIT.x, y: SUMMIT.y, drift: 0.55 },
    { x: 790, y: 282, drift: 0.5, z: -30 },
  ],
  top: everestTop,
  kx: 1.3,
  spurs: 22,
  flutes: 1.8,
  shade: ({ lam, fill, detail, sh, cav, y }) => {
    // snow: bright where the light falls full on it, lying thicker higher up
    const high = 1 - smooth(240, 700, y);
    const lit = clamp(lam) * (1 - sh);
    const snow = smooth(0.26, 0.8, lit) * (0.5 + 0.5 * high);
    // in shadow: dim, with the rock and old snow picked out faintly
    const dim = 0.05 + 0.08 * fill + 0.3 * Math.pow(detail, 2.2) * (0.55 + 0.45 * high);
    return tone(dim + 0.06 * cav + 0.86 * snow);
  },
  fog: fogAt(hex("#1a3052"), 420, 700, 0.9),
});

// 4. Lower ridges in front of it, left and right
const frontTop = outline(19, [
  [-40, 470], [60, 440], [150, 418], [220, 400], [300, 450], [380, 520], [470, 590], [560, 640],
  [700, 640], [800, 570], [880, 500], [930, 478], [1000, 505], [1100, 500], [1240, 530], [1400, 510], [1640, 540],
], 1, [220, 930]);
ridge({
  seed: 19,
  peaks: [{ x: 220, y: 400, drift: 0.6 }, { x: 930, y: 478, drift: 0.55 }, { x: 1400, y: 510, drift: 0.6 }],
  top: frontTop,
  kx: 1.2,
  spurs: 14,
  flutes: 2.2,
  shade: ({ lam, fill, detail, sh, cav, y }) => {
    const high = 1 - smooth(400, 720, y);
    const lit = clamp(lam) * (1 - sh);
    const snow = smooth(0.35, 0.9, lit) * (0.3 + 0.55 * high);
    const dim = 0.04 + 0.07 * fill + 0.24 * Math.pow(detail, 2.2);
    return tone(dim + 0.06 * cav + 0.72 * snow);
  },
  fog: fogAt(hex("#18304f"), 500, 760, 0.85),
});

// 5. Mist lying in the valley: soft drifts, lit a little on the peak's side
{
  const n = perlin(77);
  const mist = hex("#4d6d97");
  for (let py = Math.floor((560 + DY) * S); py < Math.min(PH, (860 + DY) * S); py++) {
    const y = py / S - DY;
    const band = smooth(560, 680, y) * (1 - smooth(720, 850, y));
    for (let px = 0; px < PW; px++) {
      const x = px / S;
      const drift = fbm(n, x / 320 + fbm(n, x / 500, y / 120, 2) * 0.6, y / 55, 5);
      const a = band * clamp(0.18 + drift * 0.9) * (0.75 + 0.35 * (1 - smooth(300, 1300, x)));
      put(py * PW + px, mist, a * 0.55);
    }
  }
}

// 6. The rocky ridge in the foreground: black, its rock picked out in fine
// lines where the light catches it
const nearTop = outline(88, [
  [-40, 800], [120, 770], [260, 730], [380, 700], [470, 660], [540, 630], [600, 612], [650, 628], [720, 670], [820, 720],
  [950, 770], [1080, 790], [1220, 760], [1350, 735], [1480, 760], [1640, 800],
], 1.5, [600]);
ridge({
  seed: 88,
  peaks: [{ x: 600, y: 612, drift: 0.6 }, { x: 520, y: 650, drift: 0.3, z: -24, sink: 0.3 }, { x: 1350, y: 735, drift: 0.6 }, { x: 120, y: 770, drift: 0.6 }],
  top: nearTop,
  kx: 0.95,
  ky: 0.3,
  spurs: 12,
  flutes: 4,
  grit: 1.6,
  scale: 0.55,
  stretch: 0.3,
  shade: ({ lam, sh, below }) => {
    const lines = Math.pow(smooth(0.45, 1, clamp(lam) * (1 - sh)), 1.8);
    return tone(0.04 + 0.06 * clamp(lam) + 0.46 * lines * (1 - smooth(30, 260, below)));
  },
  fog: fogAt(hex("#010204"), 760, 1000, 0.9),
});

// the foot of the picture into black
for (let py = Math.floor(820 * S); py < PH; py++) {
  const a = smooth(820, 1000, py / S) * 0.7;
  for (let px = 0; px < PW; px++) put(py * PW + px, [0.004, 0.008, 0.016], a);
}

mkdirSync("public/start", { recursive: true });
// to 8 bits with a hint of dither, so the long gradients never band
const out = Buffer.alloc(PW * PH * 3);
const dr = rng(1);
for (let i = 0; i < out.length; i++) out[i] = clamp(Math.round(clamp(img[i]) * 255 + (dr() - dr()) * 0.9), 0, 255);
await sharp(out, { raw: { width: PW, height: PH, channels: 3 } }).webp({ quality: 88, smartSubsample: true, effort: 6 }).toFile(OUT);

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

// the summit as drawn, and the ridge either side of it, for the page
let top = { x: SUMMIT.x, y: everestTop(SUMMIT.x) };
for (let x = SUMMIT.x - 30; x <= SUMMIT.x + 30; x += 0.5) if (everestTop(x) < top.y) top = { x, y: everestTop(x) };
const ridgeLine = [];
for (let x = top.x - 190; x <= top.x + 170; x += 2) ridgeLine.push(`${ridgeLine.length ? "L" : "M"}${x.toFixed(1)} ${(everestTop(x) + DY).toFixed(1)}`);
writeFileSync(
  "src/app/start/everestRidge.ts",
  `// Written by scripts/everest-scene.mjs: the ridge around the summit in\n// public/start/everest.webp (${W} by ${H} units), for the glint that travels it.\nexport const SCENE = { width: ${W}, height: ${H} };\nexport const SUMMIT = { x: ${top.x.toFixed(1)}, y: ${(top.y + DY).toFixed(1)} };\nexport const SUMMIT_RIDGE = "${ridgeLine.join(" ")}";\n// bright stars left out of the picture, for the page to twinkle: x, y, radius\nexport const TWINKLES: [number, number, number][] = ${JSON.stringify(twinkles.map((t) => [Math.round(t.x), Math.round(t.y + DY), +t.rad.toFixed(2)]))};\n`
);
console.log(`ok ${PW}x${PH}`);
