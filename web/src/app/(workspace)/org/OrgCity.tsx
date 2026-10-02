"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as one campus in 3D, after the "3D visual management"
// reference: a tight group of white buildings with grids of glowing blue
// glass, on a plain grey slab, inside a dense grey city that fades into a
// blue haze, seen from a raised three-quarter view. Each department is one
// building, a floor taller for more open work; its tag names it and shows
// its numbers on hover. Hover lights its windows; a click opens it. Loaded
// only on Organization (OrgMap brings it in on its own).

const SKY = 0x0a1d2e;
const HAZE = 0x1c4867;
const FLOOR = 1.15; // one storey, in scene units
const PLINTH = 0.4; // the slab the campus stands on

// a steady scatter, so the same windows (and the same city) every time
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// A facade: a white frame of floor slabs and pillars round panes of blue
// glass, most of them lit; and alongside it, the same panes as light for the
// glow. A glass building has thinner frames.
function facade(cols: number, floors: number, seed: number, glass: boolean) {
  const cw = 12;
  const fh = 28;
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
  a.fillStyle = "#a9bdd0";
  a.fillRect(0, 0, albedo.width, albedo.height);
  // the frame, faintly lit so it never goes black
  g.fillStyle = "#1c2a36";
  g.fillRect(0, 0, glow.width, glow.height);
  const slab = glass ? 3 : 7;
  const pillar = glass ? 1 : 2;
  const r = rng(seed);
  for (let f = 0; f < floors; f++)
    for (let k = 0; k < cols; k++) {
      const lit = r() < 0.8;
      const x = k * cw + pillar;
      const y = f * fh + slab;
      const w = cw - pillar * 2;
      const h = fh - slab - 1;
      a.fillStyle = lit ? "#a8e2ff" : glass ? "#4f93d0" : "#5d9fd6";
      a.fillRect(x, y, w, h);
      g.fillStyle = lit ? "#7fd6ff" : "#2a6fb0";
      g.fillRect(x, y, w, h);
    }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(albedo), glow: tex(glow) };
}

// one block: four walls of facade, a flat roof with a parapet and plant
function block(w: number, floors: number, d: number, seed: number, out: THREE.MeshStandardMaterial[], glass: boolean, glowRoof: boolean) {
  const h = floors * FLOOR;
  const g = new THREE.Group();
  const wall = (len: number, s: number) => {
    const { map, glow } = facade(Math.max(2, Math.round(len / 0.55)), floors, s, glass);
    const m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.1, roughness: 0.45, metalness: 0.15 });
    out.push(m);
    return m;
  };
  const roof = new THREE.MeshStandardMaterial(glowRoof ? { color: 0x8cc8f5, emissive: 0x5ec4ff, emissiveIntensity: 0.8, roughness: 0.5 } : { color: 0x8ea3b7, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall(d, seed), wall(d, seed + 1), roof, roof, wall(w, seed + 2), wall(w, seed + 3)]);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  // the parapet: a low white rim round the roof
  const rim = new THREE.MeshStandardMaterial({ color: 0xb9c9d8, roughness: 0.8 });
  for (const [pw, pd, px, pz] of [
    [w, 0.16, 0, d / 2 - 0.08],
    [w, 0.16, 0, -d / 2 + 0.08],
    [0.16, d, w / 2 - 0.08, 0],
    [0.16, d, -w / 2 + 0.08, 0],
  ] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.3, pd), rim);
    p.position.set(px, h + 0.15, pz);
    g.add(p);
  }
  // rooftop plant
  const r = rng(seed + 11);
  const plant = new THREE.MeshStandardMaterial({ color: 0x9fb3c5, roughness: 0.9 });
  for (let i = 0; i < Math.max(1, Math.round((w * d) / 40)); i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.7 + r() * 1, 0.4 + r() * 0.3, 0.7 + r() * 0.8), plant);
    u.position.set((r() - 0.5) * (w - 2), h + 0.25, (r() - 0.5) * (d - 2));
    u.castShadow = true;
    g.add(u);
  }
  return g;
}

// The campus: where each building stands and its parts, as [width, depth,
// x, z, floors fewer (negative is taller), all glass]
type Part = [number, number, number, number, number?, boolean?];
type Plot = { x: number; z: number; rot?: number; parts: Part[]; glowRoof?: boolean };
const PLOTS: Plot[] = [
  { x: -22, z: 2, parts: [[16, 4.5, 0, -4], [16, 4.5, 0, 4], [3, 3.5, 6.5, 0, 1]] }, // twin bars and a link
  { x: -3, z: -10, parts: [[18, 6, 0, 0]] },
  { x: -4, z: 3, parts: [[9, 8, 0, 0, -2, true]] }, // the glass tower
  { x: 18, z: -9, parts: [[14, 6, -3, 0], [6, 10, 4, 0, 1]] },
  { x: 6, z: 13, parts: [[16, 8, 0, 0, 1]], glowRoof: true },
  { x: 24, z: 7, parts: [[6, 14, 0, 0]] },
  { x: -24, z: 15, parts: [[12, 5, 0, 0, 1]] },
  { x: 31, z: -2, parts: [[6, 7, 0, 0]] },
];

function building(plot: Plot, floors: number, seed: number, out: THREE.MeshStandardMaterial[]) {
  const g = new THREE.Group();
  plot.parts.forEach(([w, d, x, z, fewer = 0, glass = false], i) => {
    const b = block(w, Math.max(2, floors - fewer), d, seed + i * 20, out, glass, !!plot.glowRoof && i === 0);
    b.position.set(x, 0, z);
    g.add(b);
  });
  g.position.set(plot.x, PLINTH, plot.z);
  g.rotation.y = plot.rot ?? 0;
  const [, , x, z, fewer = 0] = plot.parts[0];
  return { group: g, top: new THREE.Vector3(x, Math.max(2, floors - fewer) * FLOOR + 1.4, z) };
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
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(HAZE, 100, 400);
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 900);

    // a cool sky light, and a sun from the front left that casts soft shadows
    scene.add(new THREE.HemisphereLight(0xd2e9ff, 0x0d1b28, 0.9));
    const sun = new THREE.DirectionalLight(0xe4f2ff, 1);
    sun.position.set(-50, 80, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 260 });
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    // the ground, and the plain grey slab the campus stands on, with a faint edge
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x2a3f54, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(76, PLINTH, 44), new THREE.MeshStandardMaterial({ color: 0x4a5e72, roughness: 0.95 }));
    slab.position.set(-1, PLINTH / 2, 2);
    slab.receiveShadow = true;
    scene.add(slab);
    const edge = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-39, PLINTH + 0.01, -20),
      new THREE.Vector3(37, PLINTH + 0.01, -20),
      new THREE.Vector3(37, PLINTH + 0.01, 24),
      new THREE.Vector3(-39, PLINTH + 0.01, 24),
    ]);
    scene.add(new THREE.LineLoop(edge, new THREE.LineBasicMaterial({ color: 0x7fbde8, transparent: true, opacity: 0.18 })));

    // the departments; plots left over get quiet buildings, so the campus is whole
    const most = Math.max(1, ...departments.map((d) => d.open));
    const shown = departments.slice(0, PLOTS.length);
    const built = shown.map((d, i) => {
      const windows: THREE.MeshStandardMaterial[] = [];
      const b = building(PLOTS[i], 3 + Math.round((d.open / most) * 3), 101 + i * 37, windows);
      scene.add(b.group);
      return { ...b, windows, slug: d.slug };
    });
    PLOTS.slice(shown.length).forEach((plot, i) => {
      const windows: THREE.MeshStandardMaterial[] = [];
      scene.add(building(plot, 3, 701 + i * 37, windows).group);
      windows.forEach((m) => (m.emissiveIntensity = 0.7));
    });

    // the city all round: grey blocks on a street grid, low near the camera,
    // fading into the haze
    const r = rng(7);
    const blocks: THREE.Matrix4[] = [];
    const none = new THREE.Quaternion();
    for (let x = -300; x <= 300; x += 13)
      for (let z = -320; z <= 70; z += 13) {
        if (Math.abs(x + 1) < 46 && Math.abs(z - 2) < 30) continue;
        for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
          const h = z > 25 ? 1.5 + r() * 4 : 2 + r() * r() * 12;
          blocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 6, h / 2, z + (r() - 0.5) * 6), none, new THREE.Vector3(3 + r() * 6, h, 3 + r() * 6)));
        }
      }
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a5269, roughness: 1 }), blocks.length);
    blocks.forEach((m, i) => city.setMatrixAt(i, m));
    scene.add(city);

    // the blue haze of light behind the campus
    const hc = document.createElement("canvas");
    hc.width = hc.height = 128;
    const hg = hc.getContext("2d")!;
    const grad = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(80,160,240,0.2)");
    grad.addColorStop(1, "rgba(80,160,240,0)");
    hg.fillStyle = grad;
    hg.fillRect(0, 0, 128, 128);
    const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    haze.position.set(0, 12, -40);
    haze.scale.set(220, 90, 1);
    scene.add(haze);

    // a soft glow from the glass
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.3, 0.75);
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
      const angle = 1.955 + (still ? 0 : Math.sin(clock.getElapsedTime() * 0.06) * 0.05);
      camera.position.set(Math.cos(angle) * 112, 70, Math.sin(angle) * 112);
      camera.lookAt(0, 0, 1);

      ray.setFromCamera(pointer, camera);
      let part: THREE.Object3D | null = ray.intersectObjects(built.map((b) => b.group), true)[0]?.object ?? null;
      while (part && !built.some((b) => b.group === part)) part = part.parent;
      const now = built.find((b) => b.group === part) ?? null;
      if (now !== hovered) {
        hovered?.windows.forEach((m) => (m.emissiveIntensity = 1.1));
        now?.windows.forEach((m) => (m.emissiveIntensity = 2));
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
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a1d2e]">
      {/* dark edges, as in the reference */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgb(3_10_18/0.75))]" />
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
