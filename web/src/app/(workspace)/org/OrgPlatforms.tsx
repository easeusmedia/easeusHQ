"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as a holographic floor, after isometric smart-office renders.
// Each department is a dark platform on a glowing base, set with its own work
// and its people at it:
// - Sales on the centre platform: callers on headsets, a deals board, a deal
//   being closed.
// - Production's podcast shoot beside its editing bay.
// - Client Services round a table with a client.
// - HR interviewing a candidate.
// - Distribution's growth charts.
// - Content's ideas wall.
// The people are faceless mannequins in dark suits. Lit lines wire every
// platform to the hub across a slate tech-grid floor. Late work shows in the
// name tags, never in the scene. Pointing at a platform (or its row in the
// list) brightens it; a click opens the department.

const ICE = 0xbfe6ff;
const WIRE = 0xa9d6ff;
const ACCENT = 0x4b95e6;
const HAZE = 0x1a1f25;

type Kind = "sales" | "production" | "clients" | "hiring" | "growth" | "ideas" | "desk";
type Slot = { kind: Kind; key?: RegExp; x: number; z: number; w: number; d: number; glow: number; link: number; zFirst?: boolean };
type Pose = "sit" | "stand" | "point" | "hold";

// Where the platforms sit, the hub first. `key` claims a department by its
// name; `link` is the platform its floor line runs from.
const SLOTS: Slot[] = [
  { kind: "sales", key: /sales/i, x: 0, z: 0, w: 15, d: 12, glow: 2, link: -1 },
  { kind: "production", key: /produc/i, x: -9, z: -20, w: 13, d: 10, glow: 1.6, link: 0, zFirst: true },
  { kind: "clients", key: /client|operat/i, x: 14, z: 4, w: 7, d: 7, glow: 0.8, link: 0 },
  { kind: "hiring", key: /\bhr\b|talent|hiring|recruit/i, x: 8, z: -15, w: 6, d: 6, glow: 0.9, link: 1 },
  { kind: "growth", key: /distrib|growth/i, x: -10.5, z: 14.5, w: 7, d: 7, glow: 0.9, link: 0, zFirst: true },
  { kind: "ideas", key: /content|strateg|idea/i, x: 0, z: 21, w: 7, d: 7, glow: 0.9, link: 4 },
  { kind: "desk", x: 10, z: 25, w: 6, d: 6, glow: 0.9, link: 5 },
];
const BASE_H = 0.35;
const TOP_H = 0.45;

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Each slot's department: named ones first, then the rest, busiest first.
function place(departments: MapDepartment[]) {
  const slots = [...SLOTS];
  for (let i = slots.length; i < departments.length; i++) slots.push({ kind: "desk", x: 21 + (i - SLOTS.length) * 11, z: 25, w: 6, d: 6, glow: 0.9, link: i - 1 });
  const taken: (MapDepartment | undefined)[] = slots.map(() => undefined);
  const left = [...departments];
  slots.forEach((s, i) => {
    const j = s.key ? left.findIndex((d) => s.key!.test(d.name)) : -1;
    if (j >= 0) taken[i] = left.splice(j, 1)[0];
  });
  left.sort((a, b) => b.people - a.people);
  slots.forEach((_, i) => {
    if (!taken[i] && left.length) taken[i] = left.shift();
  });
  return slots.flatMap((slot, i) => (taken[i] ? [{ slot, i, dep: taken[i]! }] : []));
}

type Built = { slug: string; band: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; pin: THREE.Vector3; hit: THREE.Object3D[] };

export default function OrgPlatforms({ departments, onOpen }: { departments: MapDepartment[]; onOpen: (slug: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);
  const [hot, setHot] = useState<string | null>(null);
  const hotRef = useRef<string | null>(null);
  useEffect(() => {
    hotRef.current = hot;
  }, [hot]);
  const placed = place(departments);

  useEffect(() => {
    const host = box.current;
    if (!host || !departments.length) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spots = place(departments);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(HAZE);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    const DIST = 300;
    // the far floor sinks into a soft haze
    scene.fog = new THREE.Fog(HAZE, DIST - 10, DIST + 170);

    scene.add(new THREE.HemisphereLight(0xd6e8fb, 0x101318, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-40, 80, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 220 });
    key.shadow.bias = -0.0005;
    scene.add(key);

    // ---- painted textures ----
    const paint = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      draw(cv.getContext("2d")!);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    // the glowing base: near white at the top, settling into our blue
    const bandTex = paint(4, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#f5fcff");
      g.addColorStop(0.22, "#d6f0ff");
      g.addColorStop(0.62, "#8fcaf5");
      g.addColorStop(1, "#3f7fc9");
      c.fillStyle = g;
      c.fillRect(0, 0, 4, 256);
    });
    // the light it spills on the floor
    const haloTex = paint(256, 256, (c) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, 256, 256);
      c.shadowColor = "rgba(150,205,255,1)";
      c.shadowBlur = 40;
      c.fillStyle = "rgba(150,205,255,1)";
      c.fillRect(64, 64, 128, 128);
    });
    const screenTex = paint(128, 80, (c) => {
      const g = c.createLinearGradient(0, 0, 128, 80);
      g.addColorStop(0, "#1a4a7e");
      g.addColorStop(1, "#0b223d");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 80);
      c.fillStyle = "rgba(190,228,255,0.85)";
      for (let i = 0; i < 5; i++) c.fillRect(10, 12 + i * 10, 18 + ((i * 37) % 44), 3);
      c.strokeStyle = "rgba(190,228,255,0.9)";
      c.lineWidth = 2;
      c.beginPath();
      [70, 58, 64, 44, 52, 30, 36].forEach((y, i) => (i ? c.lineTo(76 + i * 7, y - 4) : c.moveTo(76, y - 4)));
      c.stroke();
    });
    // an editor's screen: the cut above, the timeline below
    const timelineTex = paint(128, 80, (c) => {
      c.fillStyle = "#0b1522";
      c.fillRect(0, 0, 128, 80);
      const g = c.createLinearGradient(8, 6, 82, 46);
      g.addColorStop(0, "#2d6aa6");
      g.addColorStop(1, "#14304f");
      c.fillStyle = g;
      c.fillRect(8, 6, 74, 40);
      c.fillStyle = "rgba(200,230,255,0.5)";
      for (let i = 0; i < 4; i++) c.fillRect(88, 8 + i * 9, 30, 3);
      const r = rng(8);
      const tones = ["#4b95e6", "#8fcaf5", "#7f8ff0", "#5fc4d8"];
      for (let t = 0; t < 3; t++)
        for (let x = 8; x < 120; ) {
          const w = 8 + r() * 26;
          c.fillStyle = tones[(t + Math.floor(r() * 4)) % 4];
          c.fillRect(x, 52 + t * 9, Math.min(w, 120 - x), 6);
          x += w + 2;
        }
      c.fillStyle = "#e8f6ff";
      c.fillRect(56, 50, 1.5, 28);
    });
    // the sales pipeline, deals moving right, revenue climbing
    const dealsTex = paint(512, 256, (c) => {
      c.fillStyle = "#0a1626";
      c.fillRect(0, 0, 512, 256);
      [5, 4, 3, 2].forEach((n, i) => {
        const x = 14 + i * 90;
        c.fillStyle = "rgba(160,215,255,0.85)";
        c.fillRect(x, 16, 78, 8);
        for (let k = 0; k < n; k++) {
          const y = 34 + k * 40;
          c.fillStyle = i === 3 ? "rgba(120,200,255,0.35)" : "rgba(90,170,255,0.16)";
          c.fillRect(x, y, 78, 32);
          c.strokeStyle = "rgba(150,210,255,0.55)";
          c.lineWidth = 1.5;
          c.strokeRect(x + 0.5, y + 0.5, 77, 31);
          c.fillStyle = "rgba(210,235,255,0.8)";
          c.fillRect(x + 8, y + 8, 40, 4);
          c.fillStyle = "rgba(210,235,255,0.45)";
          c.fillRect(x + 8, y + 18, 26, 3);
        }
      });
      c.strokeStyle = "rgba(120,195,255,0.35)";
      c.lineWidth = 1;
      c.strokeRect(378.5, 16.5, 120, 224);
      c.fillStyle = "rgba(210,235,255,0.9)";
      c.fillRect(390, 28, 60, 10);
      c.strokeStyle = "rgba(180,225,255,0.95)";
      c.lineWidth = 4;
      c.beginPath();
      [212, 196, 200, 170, 150, 156, 118, 96, 70].forEach((y, i) => (i ? c.lineTo(390 + i * 12, y) : c.moveTo(390, y)));
      c.stroke();
    });
    // HR's board: the team as a tree
    const orgTex = paint(256, 176, (c) => {
      c.fillStyle = "#0a1626";
      c.fillRect(0, 0, 256, 176);
      const rows = [[128], [64, 128, 192], [32, 80, 128, 176, 224]];
      const y = (j: number) => 30 + j * 60;
      c.strokeStyle = "rgba(150,210,255,0.6)";
      c.lineWidth = 2;
      rows.forEach((row, j) =>
        row.forEach((x) => {
          if (!j) return;
          const up = rows[j - 1].reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
          c.beginPath();
          c.moveTo(up, y(j - 1) + 14);
          c.lineTo(up, y(j - 1) + 30);
          c.lineTo(x, y(j - 1) + 30);
          c.lineTo(x, y(j) - 14);
          c.stroke();
        }),
      );
      rows.forEach((row, j) =>
        row.forEach((x) => {
          c.fillStyle = "#0a1626";
          c.strokeStyle = "rgba(180,225,255,0.9)";
          c.beginPath();
          c.arc(x, y(j), 14, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = "rgba(210,235,255,0.85)";
          c.beginPath();
          c.arc(x, y(j) - 3, 4.5, 0, Math.PI * 2);
          c.fill();
          c.fillRect(x - 7, y(j) + 3, 14, 5);
        }),
      );
    });
    // Content's ideas wall: notes, linked
    const notesTex = paint(512, 272, (c) => {
      c.fillStyle = "#d3d9e0";
      c.fillRect(0, 0, 512, 272);
      const r = rng(12);
      const tones = ["#f6f8fa", "#c4e2ff", "#93c8f5", "#4b95e6", "#dcd3f5"];
      const at: [number, number][] = [];
      for (let i = 0; i < 14; i++) at.push([30 + (i % 7) * 66 + r() * 10, 26 + Math.floor(i / 7) * 118 + r() * 40]);
      c.strokeStyle = "#6b7684";
      c.lineWidth = 2.5;
      for (let i = 1; i < at.length; i++)
        if (r() < 0.65) {
          c.beginPath();
          c.moveTo(at[i - 1][0] + 24, at[i - 1][1] + 24);
          c.lineTo(at[i][0] + 24, at[i][1] + 24);
          c.stroke();
        }
      at.forEach(([x, y], i) => {
        c.fillStyle = tones[i % tones.length];
        c.fillRect(x, y, 48, 48);
        c.fillStyle = "rgba(40,50,62,0.55)";
        c.fillRect(x + 7, y + 12, 30, 3);
        c.fillRect(x + 7, y + 20, 22, 3);
      });
    });
    // a reel on a phone: Distribution's work going out
    const reelTex = paint(64, 112, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 112);
      g.addColorStop(0, "#22568f");
      g.addColorStop(1, "#0b1a2e");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 112);
      c.fillStyle = "rgba(225,242,255,0.9)";
      c.beginPath();
      c.moveTo(26, 42);
      c.lineTo(26, 62);
      c.lineTo(42, 52);
      c.fill();
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(54, 62 + i * 12, 3.5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillRect(6, 96, 34, 3);
      c.fillStyle = "rgba(225,242,255,0.5)";
      c.fillRect(6, 103, 22, 3);
    });
    const fadeTex = paint(256, 2, (c) => {
      const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 2);
    });

    // ---- materials ----
    const slab = new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: 0.3, metalness: 0.55, envMap: env, envMapIntensity: 0.5 });
    const matte = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.3, envMap: env, envMapIntensity: 0.4 });
    const pale = new THREE.MeshStandardMaterial({ color: 0x8f99a5, roughness: 0.45, metalness: 0.3, envMap: env, envMapIntensity: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 });
    const edge = new THREE.LineBasicMaterial({ color: ICE, transparent: true, opacity: 0.5 });
    const bright = new THREE.LineBasicMaterial({ color: 0xe9f6ff, transparent: true, opacity: 0.9 });
    const rim = new THREE.LineBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.95 });
    const screen = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    const timeline = new THREE.MeshBasicMaterial({ map: timelineTex, toneMapped: false });
    const deals = new THREE.MeshBasicMaterial({ map: dealsTex, toneMapped: false });
    const org = new THREE.MeshBasicMaterial({ map: orgTex, toneMapped: false });
    const reel = new THREE.MeshBasicMaterial({ map: reelTex, toneMapped: false });
    const notes = new THREE.MeshStandardMaterial({ map: notesTex, roughness: 0.65 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe6eaef, roughness: 0.8 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xeef8ff, toneMapped: false });
    const soft = new THREE.MeshBasicMaterial({ color: 0xa6d6f8, toneMapped: false });
    const holo = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
    const wire = new THREE.MeshBasicMaterial({ color: WIRE, toneMapped: false, transparent: true, opacity: 0.85 });
    // the mannequins: dark suits, white heads and hands, a shirt and tie
    const suit = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.55, metalness: 0.2, envMap: env, envMapIntensity: 0.5 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc2c9d1, roughness: 0.42, metalness: 0.1, envMap: env, envMapIntensity: 0.6 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.6 });

    // ---- builders ----
    const cubes = new Map<string, THREE.BoxGeometry>();
    const cube = (w: number, h: number, d: number) => {
      const k = `${w}|${h}|${d}`;
      let g = cubes.get(k);
      if (!g) cubes.set(k, (g = new THREE.BoxGeometry(w, h, d)));
      return g;
    };
    const put = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      p.add(m);
      return m;
    };
    const group = (p: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry;
      p.add(g);
      return g;
    };
    // the turn that points a thing's +z along (dx, dz); a person faces -z,
    // so turn them toward the opposite of where they look
    const toward = (dx: number, dz: number) => Math.atan2(dx, dz);
    // a box standing on y
    const block = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => put(p, cube(w, h, d), mat, x, y + h / 2, z);
    const outline = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat = edge) => {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(cube(w, h, d)), mat);
      l.position.set(x, y + h / 2, z);
      p.add(l);
    };
    const loop = (p: THREE.Object3D, w: number, d: number, y: number, mat: THREE.LineBasicMaterial, x = 0, z = 0) => {
      const pts = [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ].map(([a, b]) => new THREE.Vector3(x + a, y, z + b));
      p.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
    };
    const face = (p: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const m = put(p, new THREE.PlaneGeometry(w, h), mat, x, y, z, false);
      m.rotation.y = ry;
      return m;
    };
    const pane = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      put(p, cube(w, h, d), glass, x, y + h / 2, z, false);
      outline(p, w, h, d, x, y, z);
    };
    const round = (p: THREE.Object3D, r: number, x: number, z: number, mat = matte) => {
      put(p, new THREE.CylinderGeometry(r, r, 0.06, 40), mat, x, 0.75, z);
      put(p, new THREE.CylinderGeometry(0.06, 0.12, 0.72, 16), matte, x, 0.36, z);
    };

    // A mannequin, front to -z: posed from joints, each limb a capsule.
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const up = V(0, 1, 0);
    const limbs = new Map<string, THREE.CapsuleGeometry>();
    const limb = (p: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
      const len = a.distanceTo(b);
      const k = `${r}|${len.toFixed(2)}`;
      let geo = limbs.get(k);
      if (!geo) limbs.set(k, (geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10)));
      const m = put(p, geo, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    };
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.52, 18);
    const headGeo = new THREE.SphereGeometry(0.12, 20, 16);
    const neckGeo = new THREE.CylinderGeometry(0.048, 0.055, 0.12, 12);
    const handGeo = new THREE.SphereGeometry(0.045, 10, 8);
    const phonesGeo = new THREE.TorusGeometry(0.135, 0.018, 6, 20, Math.PI);
    const person = (p: THREE.Object3D, x: number, y: number, z: number, ry: number, pose: Pose, headset = false) => {
      const g = group(p, x, y, z, ry);
      const sit = pose === "sit";
      const hip = sit ? 0.55 : 0.92;
      const sh = sit ? 1.04 : 1.42;
      const tz = sit ? 0.07 : 0.02;
      for (const s of [-1, 1]) {
        const hx = s * 0.1;
        if (sit) {
          limb(g, V(hx, hip, 0.05), V(hx, hip, -0.33), 0.075, suit);
          limb(g, V(hx, hip - 0.02, -0.35), V(hx, 0.1, -0.37), 0.065, suit);
          block(g, 0.11, 0.07, 0.24, slab, hx, 0, -0.42);
        } else {
          limb(g, V(hx, hip, 0.02), V(hx, 0.48, 0), 0.08, suit);
          limb(g, V(hx, 0.48, 0), V(hx, 0.1, 0), 0.07, suit);
          block(g, 0.11, 0.07, 0.24, slab, hx, 0, -0.05);
        }
        const shoulder = V(s * 0.2, sh, tz);
        let elbow = V(s * 0.24, sh - 0.27, tz);
        let hand = V(s * 0.25, sh - 0.52, tz - 0.03);
        if (sit) {
          elbow = V(s * 0.23, sh - 0.25, -0.04);
          hand = V(s * 0.14, sh - 0.24, -0.32);
        } else if (pose === "point" && s === 1) {
          elbow = V(0.3, sh - 0.08, -0.15);
          hand = V(0.36, sh + 0.12, -0.38);
        } else if (pose === "hold") {
          elbow = V(s * 0.23, sh - 0.26, 0);
          hand = V(s * 0.13, sh - 0.3, -0.28);
        }
        limb(g, shoulder, elbow, 0.06, suit);
        limb(g, elbow, hand, 0.05, suit);
        put(g, handGeo, skin, hand.x, hand.y, hand.z);
      }
      if (pose === "hold") face(g, 0.28, 0.36, paper, 0, sh - 0.22, -0.34).rotation.x = -1.1;
      const torso = put(g, torsoGeo, suit, 0, (hip + sh) / 2 + 0.02, tz);
      torso.scale.z = 0.68;
      limb(g, V(-0.19, sh, tz), V(0.19, sh, tz), 0.075, suit);
      const front = tz - 0.142;
      put(g, cube(0.1, 0.16, 0.01), shirt, 0, sh - 0.1, front);
      put(g, cube(0.035, 0.2, 0.012), slab, 0, sh - 0.15, front - 0.008);
      put(g, neckGeo, skin, 0, sh + 0.08, tz);
      const head = put(g, headGeo, skin, 0, sh + 0.26, tz - 0.01);
      head.scale.set(0.9, 1.22, 1);
      if (headset) {
        put(g, phonesGeo, slab, 0, sh + 0.27, tz - 0.01).scale.set(1, 1.15, 1);
        limb(g, V(0.12, sh + 0.22, tz - 0.01), V(0.05, sh + 0.17, tz - 0.14), 0.012, slab);
      }
    };
    const chair = (p: THREE.Object3D, x: number, y: number, z: number) => {
      block(p, 0.06, 0.4, 0.06, matte, x, y, z);
      block(p, 0.52, 0.08, 0.52, matte, x, y + 0.4, z);
      block(p, 0.52, 0.6, 0.06, matte, x, y + 0.45, z + 0.27);
    };
    // a chair facing -z (turned by ry), with someone in it
    const seat = (p: THREE.Object3D, x: number, z: number, ry: number, someone: boolean, headset = false) => {
      const s = group(p, x, 0, z, ry);
      chair(s, 0, 0, 0);
      if (someone) person(s, 0, 0, 0, 0, "sit", headset);
    };
    const monitor = (p: THREE.Object3D, x: number, y: number, z: number, mat: THREE.Material = screen, ry = 0) => {
      const m = group(p, x, y, z, ry);
      block(m, 0.05, 0.26, 0.05, matte, 0, 0, -0.02);
      block(m, 0.82, 0.5, 0.04, matte, 0, 0.2, -0.04);
      face(m, 0.76, 0.44, mat, 0, 0.45, -0.015);
    };
    const laptop = (p: THREE.Object3D, x: number, z: number, ry = 0) => {
      const l = group(p, x, 0.78, z, ry);
      block(l, 0.42, 0.02, 0.3, matte, 0, 0, 0);
      const lid = group(l, 0, 0.02, -0.15);
      lid.rotation.x = -0.25;
      block(lid, 0.42, 0.28, 0.015, matte, 0, 0, -0.008);
      face(lid, 0.38, 0.24, screen, 0, 0.14, 0.001);
    };
    // a desk with its screen(s), its chair, its person and lit glass sides
    const pod = (g: THREE.Object3D, x: number, z: number, someone: boolean, { headset = false, edit = false } = {}) => {
      const p = group(g, x, 0, z);
      block(p, 1.8, 0.06, 0.8, matte, 0, 0.72, -0.2);
      block(p, 0.05, 0.72, 0.74, matte, -0.86, 0, -0.2);
      block(p, 0.05, 0.72, 0.74, matte, 0.86, 0, -0.2);
      if (edit) {
        monitor(p, -0.42, 0.78, -0.4, timeline, 0.18);
        monitor(p, 0.42, 0.78, -0.4, timeline, -0.18);
      } else monitor(p, 0, 0.78, -0.42);
      seat(p, 0, 0.45, 0, someone, headset);
      pane(p, 2.5, 1.3, 0.04, 0, 0, -0.78);
      pane(p, 0.04, 1.3, 2, -1.25, 0, 0.2);
    };
    // a framed screen on two legs, its picture to the front (+z)
    const board = (p: THREE.Object3D, x: number, z: number, w: number, h: number, mat: THREE.Material, ry = 0, lift = 0.45) => {
      const b = group(p, x, 0, z, ry);
      block(b, 0.07, lift + 0.1, 0.07, matte, -w / 2 + 0.2, 0, 0);
      block(b, 0.07, lift + 0.1, 0.07, matte, w / 2 - 0.2, 0, 0);
      block(b, w + 0.12, h + 0.12, 0.08, matte, 0, lift, 0);
      face(b, w, h, mat, 0, lift + 0.06 + h / 2, 0.045);
    };
    const tripod = (p: THREE.Object3D, x: number, z: number, ry: number) => {
      const c = group(p, x, 0, z, ry);
      const leg = new THREE.CylinderGeometry(0.025, 0.025, 1.35, 8);
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        const l = put(c, leg, matte, Math.cos(a) * 0.22, 0.64, Math.sin(a) * 0.22);
        l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      }
      block(c, 0.3, 0.28, 0.46, matte, 0, 1.28, 0.04);
      const lens = put(c, new THREE.CylinderGeometry(0.11, 0.13, 0.3, 18), pale, 0, 1.42, -0.32);
      lens.rotation.x = Math.PI / 2;
      face(c, 0.2, 0.14, screen, 0, 1.44, 0.271);
    };
    const softbox = (p: THREE.Object3D, x: number, z: number, ry: number) => {
      const s = group(p, x, 0, z, ry);
      block(s, 0.06, 1.6, 0.06, matte, 0, 0, -0.1);
      block(s, 1, 1, 0.3, matte, 0, 1.4, -0.1);
      face(s, 0.9, 0.9, soft, 0, 1.9, 0.06);
    };
    const mic = (p: THREE.Object3D, x: number, z: number, ry: number) => {
      const m = group(p, x, 0.78, z, ry);
      limb(m, V(0, 0, 0), V(0, 0.32, 0), 0.02, matte);
      limb(m, V(0, 0.32, 0), V(0, 0.4, 0.16), 0.016, matte);
      limb(m, V(0, 0.4, 0.17), V(0, 0.43, 0.27), 0.05, slab);
    };
    // stairs climbing along x from (xLow, yLow) to (xHigh, yHigh)
    const stairs = (xLow: number, xHigh: number, z: number, width: number, yLow: number, yHigh: number) => {
      const n = Math.max(2, Math.round((yHigh - yLow) / 0.24));
      const run = (xHigh - xLow) / (n - 1);
      for (let k = 1; k < n; k++) {
        const top = yLow + (k * (yHigh - yLow)) / n;
        const x = xLow + (k - 0.5) * run;
        block(scene, Math.abs(run), top, width, slab, x, 0, z);
        const nx = x - run / 2;
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(nx, top + 0.01, z - width / 2), V(nx, top + 0.01, z + width / 2)]), rim));
      }
    };
    const bobs: THREE.Object3D[] = [];

    // ---- the floor: slate, a fine grid, larger panels, scattered marks ----
    const floor = put(scene, new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x252a31, roughness: 0.7, metalness: 0.15 }), 0, 0, 0, false);
    floor.rotation.x = -Math.PI / 2;
    const fine = new THREE.GridHelper(256, 128, 0x2e353e, 0x2e353e);
    fine.position.y = 0.004;
    scene.add(fine);
    const major = new THREE.GridHelper(256, 16, 0x3c4450, 0x3c4450);
    major.position.y = 0.006;
    scene.add(major);
    const r = rng(29);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x2a3038 });
    const panelLine = new THREE.LineBasicMaterial({ color: 0x46505c });
    for (let i = 0; i < 26; i++) {
      const cx = (Math.floor(r() * 14) - 7) * 16 + 8;
      const cz = (Math.floor(r() * 14) - 7) * 16 + 8;
      const pw = 4 + Math.floor(r() * 5) * 2;
      const pd = 4 + Math.floor(r() * 5) * 2;
      const pl = put(scene, new THREE.PlaneGeometry(pw, pd), panelMat, cx, 0.008, cz, false);
      pl.rotation.x = -Math.PI / 2;
      loop(scene, pw, pd, 0.01, panelLine, cx, cz);
      if (r() < 0.5) loop(scene, pw - 1.2, pd - 1.2, 0.01, panelLine, cx, cz);
    }
    // small lit squares and crosses on the grid
    const marks: THREE.Vector3[] = [];
    const crosses: THREE.Vector3[] = [];
    for (let i = 0; i < 90; i++) {
      const mx = (Math.floor(r() * 64) - 32) * 2;
      const mz = (Math.floor(r() * 64) - 32) * 2;
      const s = 0.22;
      marks.push(V(mx - s, 0.012, mz - s), V(mx + s, 0.012, mz - s), V(mx + s, 0.012, mz - s), V(mx + s, 0.012, mz + s));
      marks.push(V(mx + s, 0.012, mz + s), V(mx - s, 0.012, mz + s), V(mx - s, 0.012, mz + s), V(mx - s, 0.012, mz - s));
    }
    for (let x = -112; x <= 112; x += 16) for (let z = -112; z <= 112; z += 16) crosses.push(V(x - 0.5, 0.012, z), V(x + 0.5, 0.012, z), V(x, 0.012, z - 0.5), V(x, 0.012, z + 0.5));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(marks), new THREE.LineBasicMaterial({ color: 0x8ccaf5, transparent: true, opacity: 0.7 })));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crosses), new THREE.LineBasicMaterial({ color: 0x5a6572 })));
    const dotGeo = new THREE.PlaneGeometry(0.22, 0.22);
    dotGeo.rotateX(-Math.PI / 2);
    const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xcfeaff, toneMapped: false }), 40);
    for (let i = 0; i < 40; i++) dots.setMatrixAt(i, new THREE.Matrix4().makeTranslation((Math.floor(r() * 64) - 32) * 2, 0.014, (Math.floor(r() * 64) - 32) * 2));
    scene.add(dots);

    // ---- the platforms ----
    const tops: number[] = [];
    const built: Built[] = spots.map(({ slot, dep }, n) => {
      const g = group(scene, slot.x, 0, slot.z);
      const { w, d } = slot;
      block(g, w - 0.25, BASE_H, d - 0.25, slab, 0, 0, 0);
      const band = new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false });
      put(g, cube(w - 0.35, slot.glow, d - 0.35), band, 0, BASE_H + slot.glow / 2, 0, false);
      const lip = BASE_H + slot.glow;
      block(g, w, TOP_H, d, slab, 0, lip, 0);
      const y = lip + TOP_H;
      tops[n] = y;
      loop(g, w, d, y + 0.01, rim);
      loop(g, w, d, lip, edge);
      const halo = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const hm = put(g, new THREE.PlaneGeometry(w * 1.7, d * 1.7), halo, 0, 0.02, 0, false);
      hm.rotation.x = -Math.PI / 2;

      // the work on top, scaled up on the small platforms so it reads
      const deck = group(g, 0, y, 0);
      deck.scale.setScalar(w < 8 ? 1.4 : 1);
      const crew = dep.people;
      switch (slot.kind) {
        case "sales": {
          // callers on headsets facing the deals board; a deal being closed
          for (let i = 0; i < 6; i++) pod(deck, 1.6 + ((i % 3) - 1) * 3.1, i < 3 ? -1.6 : 1.8, i < crew, { headset: true });
          board(deck, 1.6, -d / 2 + 1.1, 7.2, 2.8, deals, 0, 0.9);
          person(deck, 5.4, 0, -d / 2 + 2.3, 0.9, "point");
          // the closing table: two of ours and the client
          round(deck, 0.85, -4.4, 2.9);
          laptop(deck, -4.2, 2.65, Math.PI * 0.9);
          face(deck, 0.3, 0.4, paper, -4.65, 0.785, 3.1).rotation.x = -Math.PI / 2;
          for (const a of [Math.PI / 4, Math.PI / 4 + (2 * Math.PI) / 3, Math.PI / 4 - (2 * Math.PI) / 3]) seat(deck, -4.4 + Math.sin(a) * 1.2, 2.9 + Math.cos(a) * 1.2, a, crew > 0);
          // a shelf of wins
          block(deck, 0.8, 1.4, 3, matte, -w / 2 + 0.7, 0, -2.6);
          outline(deck, 0.8, 1.4, 3, -w / 2 + 0.7, 0, -2.6);
          for (const tz of [-3.6, -2.6, -1.6]) put(deck, new THREE.CylinderGeometry(0.12, 0.07, 0.3, 16), pale, -w / 2 + 0.7, 1.55, tz);
          break;
        }
        case "production": {
          // the podcast set: host and guest at a table, mics, two cameras,
          // two soft lights, a padded wall behind
          block(deck, 5, 2.8, 0.16, matte, -3.4, 0, -4);
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 2; j++) {
              block(deck, 1.1, 1.1, 0.06, slab, -5.2 + i * 1.2, 0.3 + j * 1.2, -3.89);
              outline(deck, 1.1, 1.1, 0.06, -5.2 + i * 1.2, 0.3 + j * 1.2, -3.89);
            }
          block(deck, 5, 0.06, 0.06, soft, -3.4, 2.8, -3.9);
          block(deck, 2.2, 0.06, 0.9, matte, -3.4, 0.72, -1.7);
          block(deck, 0.3, 0.72, 0.3, matte, -3.4, 0, -1.7);
          seat(deck, -4.85, -1.7, -Math.PI / 2, true);
          seat(deck, -1.95, -1.7, Math.PI / 2, true);
          mic(deck, -4.05, -1.7, -Math.PI / 2);
          mic(deck, -2.75, -1.7, Math.PI / 2);
          tripod(deck, -5.3, 1.3, toward(-(-1.95 + 5.3), -(-1.7 - 1.3)));
          tripod(deck, -1.5, 1.3, toward(-(-4.85 + 1.5), -(-1.7 - 1.3)));
          softbox(deck, -6, -3, toward(2.6, 1.3));
          softbox(deck, -0.8, -3, toward(-2.6, 1.3));
          if (crew > 0) person(deck, -3.4, 0, 2.6, 0, "stand");
          // the editing bay behind glass
          pane(deck, 0.05, 1.6, 8, 0.4, 0, -0.5);
          const desks = Math.min(4, Math.max(2, crew));
          for (let i = 0; i < desks; i++) pod(deck, 2.2 + (i % 2) * 2.8, i < 2 ? -2.4 : 1.2, i < crew, { edit: true });
          break;
        }
        case "clients": {
          // the team round a table with a client, the work on a screen
          block(deck, 2.4, 0.06, 1.1, matte, 0.2, 0.72, 0.1);
          block(deck, 0.1, 0.72, 0.8, matte, -0.8, 0, 0.1);
          block(deck, 0.1, 0.72, 0.8, matte, 1.2, 0, 0.1);
          const chairs: [number, number, number][] = [
            [-0.4, 0.95, 0],
            [0.8, 0.95, 0],
            [-0.4, -0.75, Math.PI],
            [0.8, -0.75, Math.PI],
            [1.95, 0.1, Math.PI / 2],
          ];
          const sat = Math.min(5, crew + 1);
          chairs.forEach(([cx, cz, ry], i) => seat(deck, cx, cz, ry, i < sat));
          laptop(deck, -0.4, 0.38);
          laptop(deck, 0.8, -0.18, Math.PI);
          board(deck, -1.95, 0.1, 1.3, 0.75, screen, Math.PI / 2, 0.5);
          break;
        }
        case "hiring": {
          // an interview across a desk, the team's tree on the wall
          block(deck, 1.4, 0.06, 0.7, matte, 0.1, 0.72, 0);
          block(deck, 0.05, 0.72, 0.66, matte, -0.55, 0, 0);
          block(deck, 0.05, 0.72, 0.66, matte, 0.75, 0, 0);
          seat(deck, 0.1, -0.62, Math.PI, crew > 0);
          seat(deck, 0.1, 0.62, 0, true);
          laptop(deck, -0.15, -0.1, Math.PI);
          face(deck, 0.3, 0.4, paper, 0.35, 0.785, 0.12).rotation.x = -Math.PI / 2;
          board(deck, -0.9, -1.6, 1.4, 0.95, org, 0, 0.6);
          break;
        }
        case "growth": {
          // growth, charted: rising bars and an arrow, reels on phones,
          // an analyst at the numbers
          const heights = [0.5, 0.8, 1.15, 1.55, 2];
          const pts: THREE.Vector3[] = [V(-2.2, 0.45, -1)];
          heights.forEach((h, k) => {
            const bx = -1.9 + k * 0.6;
            put(deck, cube(0.4, h, 0.4), holo, bx, h / 2, -1.3, false);
            outline(deck, 0.4, h, 0.4, bx, 0, -1.3, bright);
            pts.push(V(bx, h + 0.35, -1));
          });
          pts.push(V(0.85, 2.75, -1));
          const curve = new THREE.CatmullRomCurve3(pts);
          put(deck, new THREE.TubeGeometry(curve, 48, 0.04, 8), lamp, 0, 0, 0, false);
          const head = put(deck, new THREE.ConeGeometry(0.12, 0.3, 14), lamp, 0.85, 2.75, -1, false);
          head.quaternion.setFromUnitVectors(up, curve.getTangent(1));
          for (const [k, px] of [-1.7, -0.95, -0.2].entries()) {
            const ph = group(deck, px, 0, 1.3, 0.25);
            block(ph, 0.04, 0.55, 0.04, matte, 0, 0, -0.05);
            block(ph, 0.46, 0.82, 0.05, slab, 0, 0.5 + k * 0.05, -0.05);
            face(ph, 0.4, 0.74, reel, 0, 0.91 + k * 0.05, -0.02);
          }
          round(deck, 0.45, 1.5, 0.5);
          laptop(deck, 1.5, 0.45);
          seat(deck, 1.5, 1.15, 0, crew > 0);
          if (crew > 1) person(deck, 0.9, 0, -0.2, toward(1, 0.9), "point");
          break;
        }
        case "ideas": {
          // the ideas wall, people at it, an idea lighting up over the table
          board(deck, -0.4, -1.9, 3, 1.6, notes, 0, 0.5);
          if (crew > 0) person(deck, -1.3, 0, -0.95, 0.15, "point");
          if (crew > 1) person(deck, 0.5, 0, -0.9, -0.2, "hold");
          round(deck, 0.55, 1.35, 1);
          laptop(deck, 1.35, 0.9);
          seat(deck, 1.35, 1.65, 0, crew > 2);
          const bulb = group(deck, 1.35, 1.95, 1);
          put(bulb, new THREE.SphereGeometry(0.22, 24, 18), lamp, 0, 0, 0, false);
          put(bulb, new THREE.CylinderGeometry(0.09, 0.08, 0.14, 16), pale, 0, -0.26, 0, false);
          bobs.push(bulb);
          break;
        }
        default:
          pod(deck, 0.3, 0.2, crew > 0);
      }
      const hit: THREE.Object3D[] = [];
      g.traverse((o) => (o as THREE.Mesh).isMesh && o !== hm && hit.push(o));
      return {
        slug: dep.slug,
        band,
        halo,
        pin: slot.kind === "sales" ? V(slot.x - 3.5, y + 4.4, slot.z) : V(slot.x, y + (slot.kind === "production" ? 4.2 : 3.4), slot.z),
        hit,
      };
    });

    // stairs up from Client Services to the hub, and up onto HR's platform
    const at = (kind: Kind) => spots.findIndex((s) => s.slot.kind === kind);
    const linked = at("clients");
    if (spots[0].slot === SLOTS[0] && linked >= 0) {
      const s = spots[linked].slot;
      stairs(s.x - s.w / 2, SLOTS[0].x + SLOTS[0].w / 2, s.z, 2.6, tops[linked], tops[0]);
    }
    const hr = at("hiring");
    if (hr >= 0) {
      const s = spots[hr].slot;
      stairs(s.x + s.w / 2 + 2.6, s.x + s.w / 2, s.z + 1, 1.8, 0, tops[hr]);
    }

    // ---- lit lines across the floor, wiring every platform back to the hub ----
    const routes: { pts: THREE.Vector3[]; len: number }[] = [];
    const strip = (a: THREE.Vector3, b: THREE.Vector3) => {
      if (a.distanceTo(b) < 0.01) return;
      const m = put(scene, cube(1, 1, 1), wire, (a.x + b.x) / 2, 0.03, (a.z + b.z) / 2, false);
      m.scale.set(Math.abs(b.x - a.x) + 0.1, 0.02, Math.abs(b.z - a.z) + 0.1);
    };
    spots.forEach(({ slot }, n) => {
      if (n === 0) return;
      const from = spots.find((s) => s.i === slot.link)?.slot ?? spots[0].slot;
      const a = V(from.x, 0, from.z);
      const b = V(slot.x, 0, slot.z);
      const bend = slot.zFirst ? V(a.x, 0, b.z) : V(b.x, 0, a.z);
      strip(a, bend);
      strip(bend, b);
      put(scene, cube(0.5, 0.03, 0.5), lamp, bend.x, 0.03, bend.z, false);
      routes.push({ pts: [a, bend, b], len: a.distanceTo(bend) + bend.distanceTo(b) });
    });
    // a few lines running off into the haze
    const fade = new THREE.MeshBasicMaterial({ map: fadeTex, color: WIRE, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
    const ray = (x: number, z: number, dx: number, dz: number, len: number) => {
      const m = put(scene, new THREE.PlaneGeometry(len, 0.12), fade, x + (dx * len) / 2, 0.03, z + (dz * len) / 2, false);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
    };
    ray(spots[0].slot.x, spots[0].slot.z, -1, 0, 60);
    spots.forEach(({ slot }) => slot.kind === "production" && ray(slot.x, slot.z, 0, -1, 60));
    const last = spots[spots.length - 1].slot;
    ray(last.x, last.z, 1, 0, 60);
    // a bright pulse running along each line
    const pulses = routes.map(() => put(scene, cube(0.7, 0.04, 0.16), lamp, 0, 0.04, 0, false));

    // ---- glow ----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.6, 0.8);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---- the camera: isometric, framed to fit every platform ----
    const lo = V(Infinity, 0, Infinity);
    const hi = V(-Infinity, 0, -Infinity);
    spots.forEach(({ slot }) => {
      lo.set(Math.min(lo.x, slot.x - slot.w / 2), 0, Math.min(lo.z, slot.z - slot.d / 2));
      hi.set(Math.max(hi.x, slot.x + slot.w / 2), 0, Math.max(hi.z, slot.z + slot.d / 2));
    });
    const target = V((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2);
    const tilt = V(1, 0.82, 1).normalize();
    const aim = (spin: number) => {
      camera.position.copy(target).addScaledVector(tilt.clone().applyAxisAngle(up, spin), DIST);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const fit = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      aim(0);
      const ext = new THREE.Box3();
      for (const { slot } of spots)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0, 6]) ext.expandByPoint(V(slot.x + (sx * slot.w) / 2, yy, slot.z + (sz * slot.d) / 2).applyMatrix4(camera.matrixWorldInverse));
      const side = w >= 768 ? 270 : 0; // the department list
      const scale = Math.max((ext.max.x - ext.min.x) / Math.max(1, w - side - 40), (ext.max.y - ext.min.y) / Math.max(1, h - 80)) * 1.04;
      const cx = (ext.min.x + ext.max.x) / 2;
      const cy = (ext.min.y + ext.max.y) / 2;
      camera.left = cx - ((w - side) / 2) * scale;
      camera.right = camera.left + w * scale;
      camera.top = cy + (h / 2 + 4) * scale;
      camera.bottom = camera.top - h * scale;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    const caster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-9, -9);
    let moved = false;
    const move = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      moved = true;
    };
    const leave = () => {
      pointer.set(-9, -9);
      setHot(null);
    };
    let under: string | null = null;
    const click = () => under && onOpen(under);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("click", click);

    const clock = new THREE.Clock();
    const v = V(0, 0, 0);
    const allHits = built.flatMap((b) => b.hit);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      aim(still ? 0 : Math.sin(t * 0.12) * 0.035);

      // only look for what's under the pointer when it moves
      if (moved && pointer.x > -2) {
        moved = false;
        caster.setFromCamera(pointer, camera);
        const first = caster.intersectObjects(allHits, false)[0]?.object;
        const now = first ? (built.find((b) => b.hit.includes(first))?.slug ?? null) : null;
        if (now !== under) {
          under = now;
          renderer.domElement.style.cursor = now ? "pointer" : "default";
          setHot(now);
        }
      }
      const lit = hotRef.current;
      for (const b of built) {
        const on = lit === b.slug;
        const k = on ? 1.35 : lit ? 0.45 : 1;
        b.band.color.setScalar(b.band.color.r + (k - b.band.color.r) * 0.12);
        b.halo.opacity += ((on ? 0.9 : lit ? 0.25 : 0.55) - b.halo.opacity) * 0.12;
      }
      if (!still) for (const [i, b] of bobs.entries()) b.position.y = 1.95 + Math.sin(t * 1.6 + i) * 0.06;
      routes.forEach((rt, i) => {
        const p = pulses[i];
        p.visible = !still;
        if (still) return;
        let s = ((t * 7 + i * 13) % (rt.len + 20)) - 10;
        if (s < 0 || s > rt.len) return void (p.visible = false);
        const [a, m, b] = rt.pts;
        const first = a.distanceTo(m);
        const [from, to] = s <= first ? [a, m] : [m, b];
        if (s > first) s -= first;
        const seg = from.distanceTo(to) || 1;
        p.position.set(from.x + ((to.x - from.x) * s) / seg, 0.045, from.z + ((to.z - from.z) * s) / seg);
        p.rotation.y = Math.abs(to.x - from.x) > Math.abs(to.z - from.z) ? 0 : Math.PI / 2;
      });
      built.forEach((b, i) => {
        const tag = tags.current[i];
        if (!tag) return;
        v.copy(b.pin).project(camera);
        tag.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * host.clientWidth}px, ${((1 - v.y) / 2) * host.clientHeight}px)`;
        tag.style.opacity = "1";
      });
      composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("click", click);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => mat.dispose());
      });
      [bandTex, haloTex, screenTex, timelineTex, dealsTex, orgTex, notesTex, reelTex, fadeTex, env].forEach((t) => t.dispose());
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  const total = departments.reduce((n, d) => ({ people: n.people + d.people, open: n.open + d.open, late: n.late + d.late }), { people: 0, open: 0, late: 0 });

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#1a1f25]">
      {/* cinematic light: a soft glow up top, the corners falling to dark */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_40%_36%,rgb(150_185_225/0.10),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(115%_90%_at_42%_45%,transparent_42%,rgb(5_7_10/0.78))]" />

      <div className="pointer-events-none absolute top-4 left-5 flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">Easeus Media</p>
        <div className="flex gap-2">
          {(
            [
              ["People", total.people, false],
              ["Open work", total.open, false],
              ["Late", total.late, total.late > 0],
            ] as const
          ).map(([label, n, bad]) => (
            <div key={label} className="rounded-xl border border-white/[0.08] bg-[#11151a]/80 px-3 py-1.5 backdrop-blur">
              <p className={`text-base font-semibold tabular-nums ${bad ? "text-rose-300" : "text-foreground"}`}>{n}</p>
              <p className="text-[10.5px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {placed.map(({ dep }, i) => (
        <button
          key={dep.slug}
          ref={(el) => {
            tags.current[i] = el;
          }}
          type="button"
          onClick={() => onOpen(dep.slug)}
          onMouseEnter={() => setHot(dep.slug)}
          onMouseLeave={() => setHot(null)}
          style={{ opacity: 0 }}
          className={`absolute top-0 left-0 flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-left whitespace-nowrap backdrop-blur transition-[background-color,border-color,opacity] duration-200 ${
            hot === dep.slug ? "border-accent/50 bg-[#10243a]/90" : "border-white/[0.1] bg-[#11151a]/85"
          }`}
        >
          <span className="grid size-6 place-items-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">{dep.people}</span>
          <span className="text-xs font-medium text-foreground">{dep.name}</span>
          {dep.late > 0 && <span className="text-[11px] font-medium text-rose-300 tabular-nums">{dep.late} late</span>}
        </button>
      ))}

      <div className="absolute top-4 right-4 bottom-4 hidden w-60 flex-col rounded-2xl border border-white/[0.08] bg-[#11151a]/80 p-2 backdrop-blur md:flex">
        <p className="px-2 pt-1.5 pb-2 text-xs font-medium text-muted">Departments</p>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {departments.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => onOpen(d.slug)}
              onMouseEnter={() => setHot(d.slug)}
              onMouseLeave={() => setHot(null)}
              className={`flex flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-colors ${hot === d.slug ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
            >
              <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span className={`size-1.5 shrink-0 rounded-full ${d.late ? "bg-rose-400" : "bg-accent"}`} />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="pl-3.5 text-[11px] text-muted tabular-nums">
                {d.people} {d.people === 1 ? "person" : "people"} · {d.open} open
                {d.late > 0 && <span className="text-rose-300"> · {d.late} late</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
