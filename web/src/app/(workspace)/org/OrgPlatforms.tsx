"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as a holographic control floor, after isometric smart-office
// renders: each department is a dark platform on a glowing base, furnished
// for its work (an office of desks, a plant behind glass, a sales console up
// a flight of stairs, a vault, a lounge, a studio), wired to the others by
// lit lines across a dark tech-grid floor. A platform with late work carries
// a red light and a red rim. Pointing at one (or its row in the list)
// brightens it; a click opens the department.

const ICE = 0xa8dcff;
const WIRE = 0x74c6ff;
const LATE = 0xf43f5e;
const BG = 0x0d0f12;

type Kind = "office" | "plant" | "console" | "vault" | "lounge" | "studio" | "desk";
type Slot = { kind: Kind; key?: RegExp; x: number; z: number; w: number; d: number; glow: number; link: number; zFirst?: boolean };

// Where the platforms sit, the hub first. `key` claims a department by its
// name; `link` is the platform its floor line runs from.
const SLOTS: Slot[] = [
  { kind: "office", key: /produc/i, x: 0, z: 0, w: 17, d: 14, glow: 2, link: -1 },
  { kind: "plant", key: /distrib/i, x: -10, z: -22, w: 13, d: 10, glow: 1.6, link: 0, zFirst: true },
  { kind: "console", key: /sales/i, x: 14, z: 4, w: 7, d: 7, glow: 0.8, link: 0 },
  { kind: "vault", key: /financ|admin/i, x: 8, z: -15, w: 6, d: 6, glow: 0.9, link: 1 },
  { kind: "lounge", key: /client/i, x: -10, z: 14, w: 6, d: 6, glow: 0.9, link: 0, zFirst: true },
  { kind: "studio", key: /content/i, x: 0, z: 20, w: 6, d: 6, glow: 0.9, link: 4 },
  { kind: "desk", x: 10, z: 24, w: 6, d: 6, glow: 0.9, link: 5 },
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
  for (let i = slots.length; i < departments.length; i++) slots.push({ kind: "desk", x: 21 + (i - SLOTS.length) * 11, z: 24, w: 6, d: 6, glow: 0.9, link: i - 1 });
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
    scene.background = new THREE.Color(BG);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    const DIST = 300;
    scene.fog = new THREE.Fog(BG, DIST, DIST + 220);

    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0b0d10, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2);
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
    // the glowing base: white at the top, sinking into blue
    const bandTex = paint(4, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#e6f6ff");
      g.addColorStop(0.18, "#a9dcff");
      g.addColorStop(0.6, "#4f9ee8");
      g.addColorStop(1, "#173f73");
      c.fillStyle = g;
      c.fillRect(0, 0, 4, 256);
    });
    // the light it spills on the floor
    const haloTex = paint(256, 256, (c) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, 256, 256);
      c.shadowColor = "rgba(110,185,255,1)";
      c.shadowBlur = 40;
      c.fillStyle = "rgba(110,185,255,1)";
      c.fillRect(64, 64, 128, 128);
    });
    const screenTex = paint(128, 80, (c) => {
      const g = c.createLinearGradient(0, 0, 128, 80);
      g.addColorStop(0, "#1a4a7e");
      g.addColorStop(1, "#0b223d");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 80);
      c.fillStyle = "rgba(170,220,255,0.85)";
      for (let i = 0; i < 5; i++) c.fillRect(10, 12 + i * 10, 18 + ((i * 37) % 44), 3);
      c.strokeStyle = "rgba(170,220,255,0.9)";
      c.lineWidth = 2;
      c.beginPath();
      [70, 58, 64, 44, 52, 30, 36].forEach((y, i) => (i ? c.lineTo(76 + i * 7, y - 4) : c.moveTo(76, y - 4)));
      c.stroke();
    });
    const boardTex = paint(512, 256, (c) => {
      c.fillStyle = "#0a1626";
      c.fillRect(0, 0, 512, 256);
      const r = rng(5);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const x = 12 + i * 124;
          const y = 12 + j * 120;
          c.fillStyle = "rgba(90,170,255,0.1)";
          c.fillRect(x, y, 112, 108);
          c.strokeStyle = "rgba(120,195,255,0.5)";
          c.lineWidth = 2;
          c.strokeRect(x + 1, y + 1, 110, 106);
          c.fillStyle = "rgba(170,220,255,0.9)";
          c.strokeStyle = "rgba(170,220,255,0.9)";
          if ((i + j) % 2)
            for (let k = 0; k < 6; k++) {
              const bar = 15 + r() * 60;
              c.fillRect(x + 12 + k * 16, y + 92 - bar, 9, bar);
            }
          else {
            c.lineWidth = 8;
            c.beginPath();
            c.arc(x + 56, y + 54, 30, -Math.PI / 2, -Math.PI / 2 + 1.5 + r() * 3);
            c.stroke();
          }
        }
    });
    const rackTex = paint(64, 192, (c) => {
      c.fillStyle = "#121519";
      c.fillRect(0, 0, 64, 192);
      const r = rng(3);
      for (let y = 8; y < 186; y += 10) {
        c.fillStyle = "#1c2026";
        c.fillRect(4, y, 56, 7);
        c.fillStyle = r() < 0.5 ? "#8fd2ff" : "#2a5d8c";
        c.fillRect(8, y + 2, 4, 3);
        c.fillStyle = "#3d4651";
        c.fillRect(16, y + 3, 38, 1);
      }
    });
    const fadeTex = paint(256, 2, (c) => {
      const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 2);
    });

    // ---- materials ----
    const slab = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.3, metalness: 0.55, envMap: env, envMapIntensity: 0.45 });
    const matte = new THREE.MeshStandardMaterial({ color: 0x363b43, roughness: 0.5, metalness: 0.35, envMap: env, envMapIntensity: 0.4 });
    const pale = new THREE.MeshStandardMaterial({ color: 0x8f99a5, roughness: 0.45, metalness: 0.3, envMap: env, envMapIntensity: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 });
    const edge = new THREE.LineBasicMaterial({ color: ICE, transparent: true, opacity: 0.5 });
    const rim = new THREE.LineBasicMaterial({ color: 0xe4f4ff, transparent: true, opacity: 0.95 });
    const lateRim = new THREE.LineBasicMaterial({ color: LATE, transparent: true, opacity: 0.95 });
    const screen = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    const board = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false });
    const rack = new THREE.MeshBasicMaterial({ map: rackTex, toneMapped: false });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, toneMapped: false });
    const soft = new THREE.MeshBasicMaterial({ color: 0x8fc9f5, toneMapped: false });
    const lateLamp = new THREE.MeshBasicMaterial({ color: LATE, toneMapped: false });
    const wire = new THREE.MeshBasicMaterial({ color: WIRE, toneMapped: false, transparent: true, opacity: 0.85 });

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
    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.42, 4, 12);
    const headGeo = new THREE.SphereGeometry(0.13, 16, 12);
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.6, 4, 8);
    const figure = (p: THREE.Object3D, x: number, y: number, z: number, seated: boolean) => {
      const lift = seated ? 0.45 : 0.85;
      if (!seated) {
        put(p, legGeo, pale, x - 0.09, y + 0.38, z);
        put(p, legGeo, pale, x + 0.09, y + 0.38, z);
      }
      put(p, bodyGeo, pale, x, y + lift + 0.38, z);
      put(p, headGeo, pale, x, y + lift + 0.82, z);
    };
    const chair = (p: THREE.Object3D, x: number, y: number, z: number) => {
      block(p, 0.06, 0.4, 0.06, matte, x, y, z);
      block(p, 0.52, 0.08, 0.52, matte, x, y + 0.4, z);
      block(p, 0.52, 0.6, 0.06, matte, x, y + 0.45, z + 0.27);
    };
    const monitor = (p: THREE.Object3D, x: number, y: number, z: number) => {
      block(p, 0.05, 0.26, 0.05, matte, x, y, z - 0.02);
      block(p, 0.82, 0.5, 0.04, matte, x, y + 0.2, z - 0.04);
      face(p, 0.76, 0.44, screen, x, y + 0.45, z - 0.015);
    };
    // a desk with its screen, its chair and lit glass partitions
    const pod = (g: THREE.Object3D, x: number, y: number, z: number, person: boolean) => {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      g.add(p);
      block(p, 1.8, 0.06, 0.8, matte, 0, 0.72, -0.2);
      block(p, 0.05, 0.72, 0.74, matte, -0.86, 0, -0.2);
      block(p, 0.05, 0.72, 0.74, matte, 0.86, 0, -0.2);
      monitor(p, 0, 0.78, -0.42);
      chair(p, 0, 0, 0.45);
      pane(p, 2.5, 1.3, 0.04, 0, 0, -0.78);
      pane(p, 0.04, 1.3, 2, -1.25, 0, 0.2);
      if (person) figure(p, 0, 0, 0.42, true);
    };
    const tank = (p: THREE.Object3D, x: number, y: number, z: number, r: number, len: number, alongZ = false) => {
      const t = put(p, new THREE.CapsuleGeometry(r, len, 8, 32), pale, x, y + r + 0.4, z);
      if (alongZ) t.rotation.x = Math.PI / 2;
      else t.rotation.z = Math.PI / 2;
      const ring = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.14, 32);
      for (const s of [-len / 3, len / 3]) {
        const b = put(p, ring, matte, x + (alongZ ? 0 : s), y + r + 0.4, z + (alongZ ? s : 0));
        if (alongZ) b.rotation.x = Math.PI / 2;
        else b.rotation.z = Math.PI / 2;
        block(p, alongZ ? r * 1.5 : 0.3, 0.4 + r * 0.4, alongZ ? 0.3 : r * 1.5, matte, x + (alongZ ? 0 : s), y, z + (alongZ ? s : 0));
      }
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
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(nx, top + 0.01, z - width / 2), new THREE.Vector3(nx, top + 0.01, z + width / 2)]), rim));
      }
    };

    // ---- the floor: dark, a fine grid, larger panels, scattered marks ----
    const floor = put(scene, new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.8, metalness: 0.15 }), 0, 0, 0, false);
    floor.rotation.x = -Math.PI / 2;
    const fine = new THREE.GridHelper(256, 128, 0x242a32, 0x242a32);
    fine.position.y = 0.004;
    scene.add(fine);
    const major = new THREE.GridHelper(256, 16, 0x313844, 0x313844);
    major.position.y = 0.006;
    scene.add(major);
    const r = rng(29);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x20252c });
    const panelLine = new THREE.LineBasicMaterial({ color: 0x38414d });
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
    // small lit squares and crosses on the grid, like the reference's circuitry
    const marks: THREE.Vector3[] = [];
    const crosses: THREE.Vector3[] = [];
    for (let i = 0; i < 90; i++) {
      const mx = (Math.floor(r() * 64) - 32) * 2;
      const mz = (Math.floor(r() * 64) - 32) * 2;
      const s = 0.22;
      marks.push(new THREE.Vector3(mx - s, 0.012, mz - s), new THREE.Vector3(mx + s, 0.012, mz - s), new THREE.Vector3(mx + s, 0.012, mz - s), new THREE.Vector3(mx + s, 0.012, mz + s));
      marks.push(new THREE.Vector3(mx + s, 0.012, mz + s), new THREE.Vector3(mx - s, 0.012, mz + s), new THREE.Vector3(mx - s, 0.012, mz + s), new THREE.Vector3(mx - s, 0.012, mz - s));
    }
    for (let x = -112; x <= 112; x += 16)
      for (let z = -112; z <= 112; z += 16) crosses.push(new THREE.Vector3(x - 0.5, 0.012, z), new THREE.Vector3(x + 0.5, 0.012, z), new THREE.Vector3(x, 0.012, z - 0.5), new THREE.Vector3(x, 0.012, z + 0.5));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(marks), new THREE.LineBasicMaterial({ color: 0x4f9be0, transparent: true, opacity: 0.75 })));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crosses), new THREE.LineBasicMaterial({ color: 0x46505d })));
    const dotGeo = new THREE.PlaneGeometry(0.22, 0.22);
    dotGeo.rotateX(-Math.PI / 2);
    const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x8fd2ff, toneMapped: false }), 40);
    for (let i = 0; i < 40; i++) dots.setMatrixAt(i, new THREE.Matrix4().makeTranslation((Math.floor(r() * 64) - 32) * 2, 0.014, (Math.floor(r() * 64) - 32) * 2));
    scene.add(dots);

    // ---- the platforms ----
    const tops: number[] = [];
    const built: Built[] = spots.map(({ slot, dep }, n) => {
      const g = new THREE.Group();
      g.position.set(slot.x, 0, slot.z);
      scene.add(g);
      const { w, d } = slot;
      const late = dep.late > 0;
      block(g, w - 0.25, BASE_H, d - 0.25, slab, 0, 0, 0);
      const band = new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false });
      put(g, cube(w - 0.35, slot.glow, d - 0.35), band, 0, BASE_H + slot.glow / 2, 0, false);
      const lip = BASE_H + slot.glow;
      block(g, w, TOP_H, d, slab, 0, lip, 0);
      const y = lip + TOP_H;
      tops[n] = y;
      loop(g, w, d, y + 0.01, late ? lateRim : rim);
      loop(g, w, d, lip, edge);
      const halo = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const hm = put(g, new THREE.PlaneGeometry(w * 1.7, d * 1.7), halo, 0, 0.02, 0, false);
      hm.rotation.x = -Math.PI / 2;
      if (late) block(g, 0.5, 0.12, 0.5, lateLamp, w / 2 - 0.6, y, d / 2 - 0.6);

      // the furniture, scaled up on the small platforms so it reads
      const deck = new THREE.Group();
      deck.position.y = y;
      deck.scale.setScalar(w < 8 ? 1.4 : 1);
      g.add(deck);
      switch (slot.kind) {
        case "office": {
          // desks in rows facing the dashboard wall, cabinets down one side
          const count = Math.min(12, Math.max(6, dep.people));
          const cols = Math.min(4, Math.ceil(count / 3));
          const rows = Math.ceil(count / cols);
          for (let i = 0; i < count; i++) pod(deck, 0.8 + ((i % cols) - (cols - 1) / 2) * 3.1, 0, 1.1 + (Math.floor(i / cols) - (rows - 1) / 2) * 3.3, i < dep.people);
          const bz = -d / 2 + 1.1;
          block(deck, 0.14, 1.2, 0.14, matte, -2.6, 0, bz);
          block(deck, 0.14, 1.2, 0.14, matte, 2.6, 0, bz);
          block(deck, 6.2, 2.7, 0.14, matte, 0, 1.05, bz);
          face(deck, 6, 2.5, board, 0, 2.4, bz + 0.075);
          for (let k = 0; k < 3; k++) {
            block(deck, 0.9, 2.3, 2, matte, -w / 2 + 0.75, 0, -d / 2 + 3.2 + k * 2.2);
            outline(deck, 0.9, 2.3, 2, -w / 2 + 0.75, 0, -d / 2 + 3.2 + k * 2.2);
          }
          figure(deck, 3.6, 0, bz + 1.4, false);
          break;
        }
        case "plant": {
          // two tanks behind glass, piped to a rack of machines
          pane(deck, w - 3, 3.6, d - 4, -0.5, 0, -0.6);
          tank(deck, -1.6, 0, -0.8, 1.15, 4.4);
          block(deck, 0.5, 0.9, 0.5, pale, -2.6, 2.6, -0.8);
          block(deck, 0.5, 0.9, 0.5, pale, -0.6, 2.6, -0.8);
          tank(deck, w / 2 - 1.5, 0, 1.6, 0.7, 2.2, true);
          for (let k = 0; k < 3; k++) {
            block(deck, 1.1, 2.6, 1, matte, 2.4 + k * 1.2 - 3.6, 0, d / 2 - 1.2);
            face(deck, 0.9, 2.3, rack, 2.4 + k * 1.2 - 3.6, 1.3, d / 2 - 0.69);
          }
          const pipe = new THREE.CylinderGeometry(0.09, 0.09, 4.2, 12);
          const p1 = put(deck, pipe, pale, 1.9, 2.1, -0.8);
          p1.rotation.z = Math.PI / 2;
          put(deck, new THREE.CylinderGeometry(0.09, 0.09, 2.1, 12), pale, 4, 1.05, -0.8);
          break;
        }
        case "console": {
          // a curved console of screens, the seat facing it
          const R = 2;
          const mid = (3 * Math.PI) / 4;
          const shape = new THREE.Shape();
          shape.absarc(0, 0, R + 0.55, mid - 1.1, mid + 1.1, false);
          shape.absarc(0, 0, R, mid + 1.1, mid - 1.1, true);
          const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 40 });
          topGeo.rotateX(-Math.PI / 2);
          put(deck, topGeo, matte, 0.4, 0.72, 0.4);
          const front = new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.72, 40, 1, true, Math.atan2(Math.cos(mid), -Math.sin(mid)) - 1.1, 2.2);
          put(deck, front, new THREE.MeshStandardMaterial({ color: 0x363b43, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 }), 0.4, 0.36, 0.4);
          for (const a of [-0.62, 0, 0.62]) {
            const m = new THREE.Group();
            m.position.set(0.4 + Math.cos(mid + a) * (R + 0.3), 0.78, 0.4 - Math.sin(mid + a) * (R + 0.3));
            m.rotation.y = Math.atan2(-Math.cos(mid + a), Math.sin(mid + a));
            monitor(m, 0, 0, 0);
            deck.add(m);
          }
          const seat = new THREE.Group();
          seat.position.set(0.9, 0, 0.9);
          seat.rotation.y = Math.PI / 4;
          chair(seat, 0, 0, 0);
          if (dep.people) figure(seat, 0, 0, -0.03, true);
          deck.add(seat);
          break;
        }
        case "vault": {
          // a tall vault with a lit keypad, a safe beside it
          block(deck, 1.6, 2.3, 1.4, matte, -0.9, 0, -0.9);
          outline(deck, 1.6, 2.3, 1.4, -0.9, 0, -0.9);
          face(deck, 0.3, 0.42, screen, -0.4, 1.3, -0.19);
          block(deck, 1.1, 1.1, 1.1, matte, 1.1, 0, 0.9);
          const dial = put(deck, new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), pale, 1.1, 0.6, 1.47);
          dial.rotation.x = Math.PI / 2;
          if (dep.people) figure(deck, 1.2, 0, -0.9, false);
          break;
        }
        case "lounge": {
          // two armchairs and a low table: where clients are looked after
          for (const [cx, cz, ry] of [
            [-1, -0.6, Math.PI / 4],
            [1, 0.9, (5 * Math.PI) / 4],
          ] as const) {
            const a = new THREE.Group();
            a.position.set(cx, 0, cz);
            a.rotation.y = ry;
            block(a, 1, 0.38, 0.95, matte, 0, 0, 0);
            block(a, 1, 0.75, 0.2, matte, 0, 0, -0.42);
            block(a, 0.18, 0.55, 0.95, matte, -0.5, 0, 0);
            block(a, 0.18, 0.55, 0.95, matte, 0.5, 0, 0);
            deck.add(a);
          }
          if (dep.people) figure(deck, -1, 0, -0.6, true);
          put(deck, new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32), pale, 0, 0.5, 0.15);
          put(deck, new THREE.CylinderGeometry(0.06, 0.06, 0.48, 12), matte, 0, 0.24, 0.15);
          block(deck, 0.3, 1.6, 0.3, matte, -1.8, 0, 1.8);
          block(deck, 0.5, 0.18, 0.5, soft, -1.8, 1.6, 1.8);
          break;
        }
        case "studio": {
          // a desk, a camera on its tripod and a soft light
          block(deck, 1.8, 0.06, 0.8, matte, -0.6, 0.72, -1.2);
          block(deck, 0.05, 0.72, 0.74, matte, -1.45, 0, -1.2);
          block(deck, 0.05, 0.72, 0.74, matte, 0.25, 0, -1.2);
          monitor(deck, -0.6, 0.78, -1.42);
          chair(deck, -0.6, 0, -0.55);
          if (dep.people) figure(deck, -0.6, 0, -0.58, true);
          const leg = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8);
          for (let k = 0; k < 3; k++) {
            const a = (k * Math.PI * 2) / 3;
            const l = put(deck, leg, matte, 1.3 + Math.cos(a) * 0.25, 0.72, 1.2 + Math.sin(a) * 0.25);
            l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
          }
          block(deck, 0.5, 0.35, 0.35, matte, 1.3, 1.45, 1.2);
          const lens = put(deck, new THREE.CylinderGeometry(0.12, 0.14, 0.35, 16), pale, 1.3, 1.62, 0.9);
          lens.rotation.x = Math.PI / 2;
          block(deck, 0.06, 1.8, 0.06, matte, 2, 0, -1.6);
          const box = new THREE.Group();
          box.position.set(2, 1.9, -1.6);
          box.rotation.y = -Math.PI / 5;
          block(box, 1, 1, 0.3, matte, 0, -0.5, 0);
          face(box, 0.9, 0.9, soft, 0, 0, 0.16);
          deck.add(box);
          break;
        }
        default:
          pod(deck, 0.3, 0, 0.2, dep.people > 0);
      }
      const hit: THREE.Object3D[] = [];
      g.traverse((o) => (o as THREE.Mesh).isMesh && o !== hm && hit.push(o));
      return { slug: dep.slug, band, halo, pin: slot.kind === "office" ? new THREE.Vector3(slot.x - 3, y + 4.6, slot.z) : new THREE.Vector3(slot.x, y + 3, slot.z), hit };
    });

    // stairs up from the sales console to the hub, and up onto the vault
    const at = (kind: Kind) => spots.findIndex((s) => s.slot.kind === kind);
    const hub = at("office");
    const desk = at("console");
    if (hub === 0 && desk >= 0) {
      const s = spots[desk].slot;
      stairs(s.x - s.w / 2, SLOTS[0].x + SLOTS[0].w / 2, s.z, 2.6, tops[desk], tops[0]);
    }
    const vault = at("vault");
    if (vault >= 0) {
      const s = spots[vault].slot;
      stairs(s.x + s.w / 2 + 2.6, s.x + s.w / 2, s.z + 1, 1.8, 0, tops[vault]);
    }

    // ---- lit lines across the floor, wiring every platform back to the hub ----
    const routes: { pts: THREE.Vector3[]; len: number }[] = [];
    const strip = (a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material = wire) => {
      const len = a.distanceTo(b);
      if (len < 0.01) return;
      const m = put(scene, cube(1, 1, 1), mat, (a.x + b.x) / 2, 0.03, (a.z + b.z) / 2, false);
      m.scale.set(Math.abs(b.x - a.x) + 0.1, 0.02, Math.abs(b.z - a.z) + 0.1);
    };
    spots.forEach(({ slot }, n) => {
      if (n === 0) return;
      const from = spots.find((s) => s.i === slot.link)?.slot ?? spots[0].slot;
      const a = new THREE.Vector3(from.x, 0, from.z);
      const b = new THREE.Vector3(slot.x, 0, slot.z);
      const bend = slot.zFirst ? new THREE.Vector3(a.x, 0, b.z) : new THREE.Vector3(b.x, 0, a.z);
      strip(a, bend);
      strip(bend, b);
      const node = put(scene, cube(0.5, 0.03, 0.5), lamp, bend.x, 0.03, bend.z, false);
      node.castShadow = false;
      routes.push({ pts: [a, bend, b], len: a.distanceTo(bend) + bend.distanceTo(b) });
    });
    // a few lines running off into the dark
    const fade = new THREE.MeshBasicMaterial({ map: fadeTex, color: WIRE, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
    const ray = (x: number, z: number, dx: number, dz: number, len: number) => {
      const m = put(scene, new THREE.PlaneGeometry(len, 0.12), fade, x + (dx * len) / 2, 0.03, z + (dz * len) / 2, false);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
    };
    ray(spots[0].slot.x, spots[0].slot.z, -1, 0, 60);
    spots.forEach(({ slot }) => slot.kind === "plant" && ray(slot.x, slot.z, 0, -1, 60));
    const last = spots[spots.length - 1].slot;
    ray(last.x, last.z, 1, 0, 60);
    // a bright pulse running along each line
    const pulses = routes.map(() => put(scene, cube(0.7, 0.04, 0.16), lamp, 0, 0.04, 0, false));

    // ---- glow ----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.78);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---- the camera: isometric, framed to fit every platform ----
    const lo = new THREE.Vector3(Infinity, 0, Infinity);
    const hi = new THREE.Vector3(-Infinity, 0, -Infinity);
    spots.forEach(({ slot }) => {
      lo.set(Math.min(lo.x, slot.x - slot.w / 2), 0, Math.min(lo.z, slot.z - slot.d / 2));
      hi.set(Math.max(hi.x, slot.x + slot.w / 2), 0, Math.max(hi.z, slot.z + slot.d / 2));
    });
    const target = new THREE.Vector3((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2);
    const tilt = new THREE.Vector3(1, 0.82, 1).normalize();
    const aim = (spin: number) => {
      camera.position.copy(target).addScaledVector(tilt.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spin), DIST);
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
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0, 6]) ext.expandByPoint(new THREE.Vector3(slot.x + (sx * slot.w) / 2, yy, slot.z + (sz * slot.d) / 2).applyMatrix4(camera.matrixWorldInverse));
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
    const move = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
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
    const v = new THREE.Vector3();
    const allHits = built.flatMap((b) => b.hit);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      aim(still ? 0 : Math.sin(t * 0.12) * 0.035);

      if (pointer.x > -2) {
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
        const c = b.band.color.r + (k - b.band.color.r) * 0.12;
        b.band.color.setScalar(c);
        b.halo.opacity += ((on ? 0.9 : lit ? 0.25 : 0.55) - b.halo.opacity) * 0.12;
      }
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
      [bandTex, haloTex, screenTex, boardTex, rackTex, fadeTex, env].forEach((t) => t.dispose());
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  const total = departments.reduce((n, d) => ({ people: n.people + d.people, open: n.open + d.open, late: n.late + d.late }), { people: 0, open: 0, late: 0 });

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0f12]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_85%_at_42%_48%,transparent_50%,rgb(0_0_0/0.6))]" />

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
            <div key={label} className="rounded-xl border border-white/[0.08] bg-[#0f1216]/80 px-3 py-1.5 backdrop-blur">
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
            hot === dep.slug ? "border-accent/50 bg-[#10243a]/90" : "border-white/[0.1] bg-[#0f1216]/85"
          }`}
        >
          <span className={`grid size-6 place-items-center rounded-full text-[10px] font-semibold ${dep.late ? "bg-rose-400/20 text-rose-300" : "bg-accent/20 text-accent"}`}>{dep.people}</span>
          <span className="text-xs font-medium text-foreground">{dep.name}</span>
        </button>
      ))}

      <div className="absolute top-4 right-4 bottom-4 hidden w-60 flex-col rounded-2xl border border-white/[0.08] bg-[#0f1216]/80 p-2 backdrop-blur md:flex">
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
