"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as a campus in 3D, after the "3D visual management"
// reference: low-rise buildings with light facades and long bands of
// windows glowing a soft cyan, flat roofs with parapets and plant, laid on
// a plain grey-blue ground beside a sports field, grey massing fading into
// a teal-navy haze, seen from a raised three-quarter view. Each department
// is one building, a floor taller for more open work; its tag names it and
// shows its numbers on hover. Hover lights its windows; a click opens it.
// Loaded only on Organization (OrgMap brings it in on its own).

const SKY = 0x123a52;
const GROUND = 0x31465a;
const FLOOR = 1.15; // one storey, in scene units

// a steady scatter, so the same windows (and the same city) every time
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// A facade: light spandrels between long bands of glass, with mullions; and
// alongside it, the same windows as light (lit ones only) for the glow
function facade(cols: number, floors: number, seed: number) {
  const cw = 22;
  const fh = 30;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = cols * cw;
    c.height = floors * fh;
    return c;
  };
  const albedo = make();
  const glow = make();
  const a = albedo.getContext("2d")!;
  const g = glow.getContext("2d")!;
  a.fillStyle = "#d3e2ef";
  a.fillRect(0, 0, albedo.width, albedo.height);
  g.fillStyle = "#000";
  g.fillRect(0, 0, glow.width, glow.height);
  const r = rng(seed);
  for (let f = 0; f < floors; f++) {
    const y = f * fh + fh * 0.3;
    const h = fh * 0.55;
    // the band of glass, all of it faintly lit
    a.fillStyle = "#3f78a6";
    a.fillRect(0, y, albedo.width, h);
    g.fillStyle = "#16456b";
    g.fillRect(0, y, glow.width, h);
    for (let k = 0; k < cols; k++) {
      const x = k * cw;
      if (r() < 0.55) {
        const warm = r() < 0.2;
        a.fillStyle = warm ? "#e6f6ff" : "#a8dcff";
        a.fillRect(x + 2, y + 2, cw - 4, h - 4);
        g.fillStyle = warm ? "#e8f7ff" : "#5fb4f0";
        g.fillRect(x + 2, y + 2, cw - 4, h - 4);
      }
      // the mullion
      a.fillStyle = "#b5cade";
      a.fillRect(x, y, 2, h);
    }
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(albedo), glow: tex(glow) };
}

type Building = { group: THREE.Group; windows: THREE.MeshStandardMaterial[]; top: THREE.Vector3 };

// one block: four walls of facade, a flat roof with a parapet and plant
function block(w: number, floors: number, d: number, seed: number, out: THREE.MeshStandardMaterial[]) {
  const h = floors * FLOOR;
  const g = new THREE.Group();
  const wall = (len: number, s: number) => {
    const { map, glow } = facade(Math.max(3, Math.round(len / 1.1)), floors, s);
    const m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.85, roughness: 0.55, metalness: 0.1 });
    out.push(m);
    return m;
  };
  const roof = new THREE.MeshStandardMaterial({ color: 0x8ea8bf, roughness: 0.95 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall(d, seed), wall(d, seed + 1), roof, roof, wall(w, seed + 2), wall(w, seed + 3)]);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  // the parapet: a low rim round the roof
  const rim = new THREE.MeshStandardMaterial({ color: 0xbcd0e2, roughness: 0.8 });
  for (const [pw, pd, px, pz] of [
    [w, 0.18, 0, d / 2 - 0.09],
    [w, 0.18, 0, -d / 2 + 0.09],
    [0.18, d, w / 2 - 0.09, 0],
    [0.18, d, -w / 2 + 0.09, 0],
  ] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.35, pd), rim);
    p.position.set(px, h + 0.17, pz);
    p.castShadow = true;
    g.add(p);
  }
  // rooftop plant
  const r = rng(seed + 11);
  const plant = new THREE.MeshStandardMaterial({ color: 0x6f889e, roughness: 0.9 });
  for (let i = 0; i < Math.max(1, Math.round((w * d) / 30)); i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.8 + r() * 1.2, 0.5 + r() * 0.4, 0.8 + r() * 1), plant);
    u.position.set((r() - 0.5) * (w - 2.5), h + 0.3, (r() - 0.5) * (d - 2.5));
    u.castShadow = true;
    g.add(u);
  }
  return g;
}

// A department's building, by its kind: a long slab, an L of two wings, a
// courtyard, or a block on a podium; floors from its open work
function building(kind: number, floors: number, seed: number): Building {
  const windows: THREE.MeshStandardMaterial[] = [];
  const g = new THREE.Group();
  const put = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    g.add(o);
  };
  let top = floors * FLOOR;
  let roofAt: [number, number] = [0, 0];
  if (kind === 1) {
    // an L
    put(block(14, floors, 4.6, seed, windows), 0, 0, -2.7);
    put(block(4.6, Math.max(3, floors - 1), 8, seed + 20, windows), -4.7, 0, 3.3);
    roofAt = [2, -2.7];
  } else if (kind === 2) {
    // a courtyard, open to the front
    put(block(13, floors, 4.2, seed, windows), 0, 0, -4.4);
    put(block(4.2, floors - 1, 8.8, seed + 20, windows), -4.4, 0, 2.1);
    put(block(4.2, floors - 1, 8.8, seed + 40, windows), 4.4, 0, 2.1);
    roofAt = [0, -4.4];
  } else if (kind === 3) {
    // a block on a podium
    put(block(13, 2, 9, seed, windows), 0, 0, 0);
    put(block(6.5, floors, 5.5, seed + 20, windows), 1.5, 2 * FLOOR, -0.8);
    top = (floors + 2) * FLOOR;
    roofAt = [1.5, -0.8];
  } else {
    // a long slab
    put(block(15, floors, 5.2, seed, windows), 0, 0, 0);
  }
  // a blue panel on the roof, as in the reference
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshStandardMaterial({ color: 0x3b8de0, emissive: 0x2f7fd6, emissiveIntensity: 0.9, roughness: 0.4 }));
  panel.rotation.x = -Math.PI / 2;
  panel.position.set(roofAt[0], top + 0.02, roofAt[1]);
  g.add(panel);
  return { group: g, windows, top: new THREE.Vector3(0, top + 1.6, 0) };
}

// where the departments stand on the campus, round the sports field
const PLOTS: { x: number; z: number; rot: number }[] = [
  { x: -24, z: -16, rot: 0 },
  { x: -2, z: -21, rot: 0 },
  { x: 21, z: -15, rot: 0 },
  { x: 24, z: 8, rot: -Math.PI / 2 },
  { x: 2, z: 19, rot: Math.PI },
  { x: -25, z: 9, rot: Math.PI / 2 },
  { x: 40, z: -2, rot: -Math.PI / 2 },
  { x: -42, z: -2, rot: Math.PI / 2 },
];

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
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(0x1a4660, 70, 190);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 600);

    // a cool sky light, and a sun from the back left that casts soft shadows
    scene.add(new THREE.HemisphereLight(0xb8dcff, 0x14232f, 1.3));
    const sun = new THREE.DirectionalLight(0xdcefff, 1.5);
    sun.position.set(-40, 70, -30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 220 });
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    // the ground: plain grey-blue
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // the sports field in the middle, painted on one plane: a running track
    // round a pitch, lined in white (32 px to a unit)
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 576;
    const f = c.getContext("2d")!;
    const stadium = (r: number) => {
      f.beginPath();
      f.arc(352, 288, r, Math.PI / 2, Math.PI * 1.5);
      f.arc(672, 288, r, -Math.PI / 2, Math.PI / 2);
      f.closePath();
    };
    stadium(256);
    f.fillStyle = "#4a6278";
    f.fill();
    stadium(200);
    f.fillStyle = "#2f4a5f";
    f.fill();
    f.strokeStyle = "rgba(226,238,248,0.7)";
    f.lineWidth = 2;
    for (const r of [256, 242, 228, 214, 200]) {
      stadium(r);
      f.stroke();
    }
    f.strokeRect(256, 144, 512, 288);
    f.strokeRect(256, 224, 56, 128);
    f.strokeRect(712, 224, 56, 128);
    f.beginPath();
    f.moveTo(512, 144);
    f.lineTo(512, 432);
    f.stroke();
    f.beginPath();
    f.arc(512, 288, 40, 0, Math.PI * 2);
    f.stroke();
    const paint = new THREE.CanvasTexture(c);
    paint.colorSpace = THREE.SRGBColorSpace;
    paint.anisotropy = 8;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshStandardMaterial({ map: paint, transparent: true, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.03;
    pitch.receiveShadow = true;
    scene.add(pitch);

    // the departments, each on a paved plot
    const most = Math.max(1, ...departments.map((d) => d.open));
    const built = departments.slice(0, PLOTS.length).map((d, i) => {
      const b = building(i % 4, 3 + Math.round((d.open / most) * 5), 101 + i * 17);
      const plot = PLOTS[i];
      const pave = new THREE.Mesh(new THREE.PlaneGeometry(19, 15), new THREE.MeshStandardMaterial({ color: 0x3a5064, roughness: 1 }));
      pave.rotation.x = -Math.PI / 2;
      pave.position.y = 0.02;
      pave.receiveShadow = true;
      b.group.add(pave);
      b.group.position.set(plot.x, 0, plot.z);
      b.group.rotation.y = plot.rot;
      scene.add(b.group);
      return { ...b, slug: d.slug };
    });

    // grey massing all round, fading into the haze
    const r = rng(7);
    const mass = new THREE.MeshStandardMaterial({ color: 0x31495e, roughness: 1 });
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const dist = 58 + r() * 80;
      const h = 2 + r() * 9;
      const m = new THREE.Mesh(new THREE.BoxGeometry(6 + r() * 12, h, 5 + r() * 9), mass);
      m.position.set(Math.cos(a) * dist, h / 2, Math.sin(a) * dist);
      m.rotation.y = Math.round(r() * 4) * (Math.PI / 2);
      m.receiveShadow = true;
      scene.add(m);
    }

    // a gentle glow from the windows only
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.45, 0.62);
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

    // pointing at a department lights its windows; a click opens it
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-9, -9);
    let hovered: (typeof built)[number] | null = null;
    const move = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const leave = () => pointer.set(-9, -9);
    const click = () => hovered && onOpen(hovered.slug);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("click", click);

    let frame = 0;
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    const spots: { x: number; y: number; seen: boolean }[] = [];
    const loop = () => {
      frame = requestAnimationFrame(loop);
      // the reference's raised three-quarter view, drifting only a little
      const angle = 2.2 + (still ? 0 : Math.sin(clock.getElapsedTime() * 0.06) * 0.06);
      camera.position.set(Math.cos(angle) * 92, 62, Math.sin(angle) * 92);
      camera.lookAt(0, 0, 2);

      ray.setFromCamera(pointer, camera);
      let part: THREE.Object3D | null = ray.intersectObjects(built.map((b) => b.group), true)[0]?.object ?? null;
      while (part && !built.some((b) => b.group === part)) part = part.parent;
      const now = built.find((b) => b.group === part) ?? null;
      if (now !== hovered) {
        hovered?.windows.forEach((m) => (m.emissiveIntensity = 0.85));
        now?.windows.forEach((m) => (m.emissiveIntensity = 1.5));
        hovered = now;
        renderer.domElement.style.cursor = now ? "pointer" : "default";
      }

      built.forEach((b, i) => {
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
          (mat as THREE.MeshStandardMaterial).emissiveMap?.dispose();
          mat.dispose();
        });
      });
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0e2639]">
      {/* a soft vignette, as in the reference */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(85%_75%_at_50%_45%,transparent_60%,rgb(4_14_24/0.55))]" />
      {departments.slice(0, PLOTS.length).map((d, i) => (
        <button
          key={d.slug}
          ref={(el) => {
            tags.current[i] = el;
          }}
          type="button"
          onClick={() => onOpen(d.slug)}
          className="group/tag absolute top-0 left-0 border-l-2 border-[rgb(127_200_245)] bg-[rgb(8_24_38/0.72)] px-2.5 py-1 text-left whitespace-nowrap backdrop-blur-sm transition-[background-color,opacity] duration-300 hover:bg-[rgb(10_32_50/0.9)]"
          style={{ opacity: 0 }}
        >
          <span className="block text-[11px] font-semibold tracking-wide text-[rgb(225_242_255)] uppercase">{d.name}</span>
          {/* its numbers, on hover */}
          <span className="grid grid-rows-[0fr] text-[10px] text-[rgb(160_200_230)] tabular-nums transition-[grid-template-rows] duration-300 group-hover/tag:grid-rows-[1fr]">
            <span className="overflow-hidden">
              {d.people} {d.people === 1 ? "person" : "people"} · {d.open} open
              {d.late > 0 && <span className="text-rose-300"> · {d.late} late</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
