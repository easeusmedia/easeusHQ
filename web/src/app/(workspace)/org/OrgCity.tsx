"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as a night city in 3D, after the "3D visual management"
// reference: deep teal-blue fog, office buildings of glass with grids of
// lit windows and faint cyan edges, a quiet city around them, a campus
// with a running track in the middle, light running along the roads from
// one department to the next, a slow camera, and a soft bloom over it all.
// Each department is one building, as tall as the work it has open; its
// roof beacon is red when anything's late. Hover lights it; a click opens
// it. Loaded only on Organization (OrgMap brings it in on its own).

const BG = 0x062236;
const CYAN = 0x7fd4ff;

// a steady scatter, so the same windows (and the same city) every time
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// a wall of windows, as a texture: one cell per window, some lit
function windows(cols: number, floors: number, seed: number, bright: number) {
  const cw = 12;
  const ch = 18;
  const c = document.createElement("canvas");
  c.width = cols * cw;
  c.height = floors * ch;
  const g = c.getContext("2d")!;
  g.fillStyle = "#123a5a";
  g.fillRect(0, 0, c.width, c.height);
  const r = rng(seed);
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < cols; k++) {
      const on = r() < bright;
      g.fillStyle = on ? (r() < 0.25 ? "#e8f7ff" : "#8fd3fa") : "#1a4a70";
      g.fillRect(k * cw + 2, f * ch + 5, cw - 4, ch - 8);
    }
    // the floor's slab line
    g.fillStyle = "#1d4c72";
    g.fillRect(0, f * ch, c.width, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type Built = { group: THREE.Group; lit: THREE.MeshStandardMaterial[]; beacon: THREE.MeshBasicMaterial; top: THREE.Vector3; slug?: string; pad?: THREE.Mesh };

// one block of a building: glass walls of windows, a dark roof with a parapet, cyan edges
function block(w: number, h: number, d: number, seed: number, bright: number, glow: number, out: THREE.MeshStandardMaterial[]) {
  const g = new THREE.Group();
  const side = (cols: number, s: number) => {
    const tex = windows(cols, Math.max(3, Math.round(h / 0.8)), s, bright);
    const m = new THREE.MeshStandardMaterial({ color: 0x2a6694, map: tex, emissive: 0xbfe8ff, emissiveMap: tex, emissiveIntensity: glow, metalness: 0.45, roughness: 0.35 });
    out.push(m);
    return m;
  };
  const roof = new THREE.MeshStandardMaterial({ color: 0x0d2134, metalness: 0.3, roughness: 0.8 });
  const cx = Math.max(3, Math.round(w / 0.55));
  const cz = Math.max(3, Math.round(d / 0.55));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side(cz, seed), side(cz, seed + 1), roof, roof, side(cx, seed + 2), side(cx, seed + 3)]);
  mesh.position.y = h / 2;
  g.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35 }));
  edges.position.copy(mesh.position);
  g.add(edges);
  // the parapet round the roof
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.3, d + 0.15), roof);
  parapet.position.y = h + 0.15;
  g.add(parapet);
  return g;
}

// a whole building, by kind: a tower, a wide slab, an L of two wings, or a tower on a podium
function building(kind: number, h: number, seed: number, bright: number, glow: number) {
  const lit: THREE.MeshStandardMaterial[] = [];
  const g = new THREE.Group();
  let top = h;
  if (kind === 1) {
    g.add(block(7, h * 0.6, 4.2, seed, bright, glow, lit));
    top = h * 0.6;
  } else if (kind === 2) {
    const a = block(6, h * 0.75, 2.6, seed, bright, glow, lit);
    const b = block(2.6, h, 6, seed + 9, bright, glow, lit);
    a.position.set(-0.9, 0, 1.5);
    b.position.set(1.7, 0, -0.6);
    g.add(a, b);
  } else if (kind === 3) {
    g.add(block(6.4, h * 0.22, 6.4, seed, bright, glow, lit));
    const t = block(3.4, h * 0.78, 3.4, seed + 5, bright, glow, lit);
    t.position.y = h * 0.22;
    g.add(t);
  } else {
    g.add(block(3.8, h, 3.8, seed, bright, glow, lit));
  }
  // rooftop plant, and a mast with its beacon
  const plant = new THREE.MeshStandardMaterial({ color: 0x1a3550, roughness: 0.7 });
  const r = rng(seed + 3);
  for (let i = 0; i < 3; i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.6 + r() * 0.6, 0.35, 0.6 + r() * 0.5), plant);
    u.position.set((r() - 0.5) * 1.6, top + 0.48, (r() - 0.5) * 1.6);
    g.add(u);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.2), new THREE.MeshBasicMaterial({ color: 0x9fdcff }));
  mast.position.y = top + 1.4;
  g.add(mast);
  const beacon = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), beacon);
  b.position.y = top + 2.6;
  g.add(b);
  return { group: g, lit, beacon, top: new THREE.Vector3(0, top + 3.2, 0) } as Built;
}

export default function OrgCity({ departments, onOpen }: { departments: MapDepartment[]; onOpen: (slug: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(0x0a2c45, 0.011);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500);

    scene.add(new THREE.HemisphereLight(0x7cc2f5, 0x05182a, 1.0));
    const sun = new THREE.DirectionalLight(0xbfe6ff, 1.6);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    // the ground: dark, with a faint grid
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x0a2840, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(260, 104, 0x1b5a86, 0x0b2a42);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.02;
    scene.add(grid);

    // the campus in the middle: a running track round a field
    const field = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ color: 0x0a2a3d, roughness: 0.9 }));
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.04;
    scene.add(field);
    for (const [rx, ry, o] of [
      [9, 5.4, 0.55],
      [9.8, 6.1, 0.3],
    ] as const) {
      const curve = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2);
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0.06, p.y))), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: o }));
      scene.add(line);
    }

    // the departments, round the campus
    const most = Math.max(1, ...departments.map((d) => d.open));
    const radius = 23;
    const built: Built[] = departments.map((d, i) => {
      const angle = (i / Math.max(departments.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const h = 6 + (d.open / most) * 16;
      const b = building(i % 4, h, 101 + i * 17, 0.6, 0.8);
      b.group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      b.group.rotation.y = -angle + Math.PI / 2;
      b.slug = d.slug;
      if (d.late) b.beacon.color.set(0xff6b81);
      // a glowing pad under it
      const pad = new THREE.Mesh(new THREE.RingGeometry(4.9, 5.2, 64), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.07;
      b.group.add(pad);
      b.pad = pad;
      scene.add(b.group);
      return b;
    });

    // a quiet city around them, dimmer, fading into the fog
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const dist = 34 + r() * 60;
      const f = building(i % 4 === 1 ? 1 : 0, 3 + r() * 9, 900 + i * 13, 0.4, 0.45);
      f.group.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
      f.group.rotation.y = Math.round(r() * 4) * (Math.PI / 2);
      f.group.scale.setScalar(0.7 + r() * 0.5);
      scene.add(f.group);
    }

    // the roads the work travels, Sales through to Distribution, with light running along them
    const roads: { curve: THREE.CatmullRomCurve3; spark: THREE.Mesh; t: number }[] = [];
    for (let i = 1; i < Math.min(5, built.length); i++) {
      const a = built[i - 1].group.position;
      const b = built[i].group.position;
      const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(0.7);
      const curve = new THREE.CatmullRomCurve3([a.clone().setY(0.1), mid.setY(0.1), b.clone().setY(0.1)]);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.12, 6), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55 })));
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe6f6ff }));
      scene.add(spark);
      roads.push({ curve, spark, t: i * 0.27 });
    }

    // the glow
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.28);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const size = () => {
      const w = host.clientWidth;
      const hgt = host.clientHeight;
      renderer.setSize(w, hgt, false);
      composer.setSize(w, hgt);
      bloom.setSize(w, hgt);
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    // pointing at a department lights it up; a click opens it
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-9, -9);
    let hovered: Built | null = null;
    const move = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const leave = () => pointer.set(-9, -9);
    const click = () => hovered?.slug && onOpen(hovered.slug);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("click", click);

    let angle = 0.6;
    let frame = 0;
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    const spots: { x: number; y: number; seen: boolean }[] = [];
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      const time = clock.elapsedTime;
      if (!still) angle += dt * 0.05;
      camera.position.set(Math.cos(angle) * 74, 50, Math.sin(angle) * 74);
      camera.lookAt(0, 5, 0);

      ray.setFromCamera(pointer, camera);
      // the building the pointer is on: up from whatever part of it was hit
      let part: THREE.Object3D | null = ray.intersectObjects(built.map((b) => b.group), true)[0]?.object ?? null;
      while (part && !built.some((b) => b.group === part)) part = part.parent;
      const now = built.find((b) => b.group === part) ?? null;
      if (now !== hovered) {
        hovered?.lit.forEach((m) => (m.emissiveIntensity = 0.8));
        now?.lit.forEach((m) => (m.emissiveIntensity = 1.35));
        hovered = now;
        renderer.domElement.style.cursor = now ? "pointer" : "default";
      }

      built.forEach((b, i) => {
        // the beacon blinks; the pad breathes
        const blink = 0.5 + 0.5 * Math.sin(time * 3 + i);
        b.beacon.opacity = 0.35 + 0.65 * blink;
        if (b.pad) {
          const s = 1 + 0.06 * Math.sin(time * 1.6 + i);
          b.pad.scale.set(s, s, s);
          (b.pad.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.12 * blink;
        }
        // where its tag goes: above its roof, on the page
        v.copy(b.top).applyMatrix4(b.group.matrixWorld).project(camera);
        spots[i] = { x: ((v.x + 1) / 2) * host.clientWidth, y: ((1 - v.y) / 2) * host.clientHeight, seen: v.z < 1 };
      });
      // tags that would overlap are nudged apart, the farther one up
      const boxes = spots.map((p, i) => ({ i, x: p.x, y: p.y, w: tags.current[i]?.offsetWidth ?? 0, h: tags.current[i]?.offsetHeight ?? 0 })).sort((a, c) => c.y - a.y);
      for (let a = 0; a < boxes.length; a++)
        for (let c = a + 1; c < boxes.length; c++) {
          const A = boxes[a];
          const C = boxes[c];
          const apart = Math.abs(A.x - C.x) >= (A.w + C.w) / 2 + 6;
          const gap = A.y - A.h - 6 - C.y;
          if (!apart && gap < 0) C.y += gap;
        }
      boxes.forEach((p) => {
        const tag = tags.current[p.i];
        if (!tag) return;
        tag.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
        tag.style.opacity = spots[p.i].seen ? "1" : "0";
      });
      roads.forEach((road) => {
        road.t = (road.t + dt * 0.22) % 1;
        road.spark.position.copy(road.curve.getPointAt(road.t)).setY(0.4);
      });
      composer.render();
    };
    loop();

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
        mats.forEach((mat) => {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        });
      });
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[rgb(120_190_255/0.16)] bg-[#04131f]">
      {/* a soft vignette, as on a screen */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_45%,transparent_55%,rgb(2_8_14/0.6))]" />
      <p className="pointer-events-none absolute top-4 left-5 text-[11px] font-semibold tracking-[0.2em] text-[rgb(150_205_240/0.8)] uppercase">Easeus Media · Organization</p>
      {departments.map((d, i) => (
        <button
          key={d.slug}
          ref={(el) => {
            tags.current[i] = el;
          }}
          type="button"
          onClick={() => onOpen(d.slug)}
          className="absolute top-0 left-0 border-l-2 border-[rgb(127_212_255)] bg-[rgb(4_19_31/0.78)] px-2.5 py-1.5 text-left whitespace-nowrap backdrop-blur-sm transition-[background-color,opacity] duration-300 hover:bg-[rgb(8_32_52/0.9)]"
          style={{ opacity: 0 }}
        >
          <span className="block text-[11px] font-semibold tracking-wide text-[rgb(220_242_255)] uppercase">{d.name}</span>
          <span className="block text-[10px] text-[rgb(150_195_230)] tabular-nums">
            {d.people} {d.people === 1 ? "person" : "people"} · {d.open} open
            {d.late > 0 && <span className="text-rose-300"> · {d.late} late</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
