"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as a campus of glass buildings, after smart-building
// dashboards: one white-and-glass building per department (a tower, a round
// podium, a long slab, a stepped terrace, twin towers, a wide hall), its
// floors stacked in white slabs with reflective glass and a lit blue core,
// on a dark city grid among quiet context blocks. A pin floats over each;
// a building with late work has a red beacon on its roof. Pointing at one
// (or its row in the list) lights it; a click opens the department.

const ACCENT = 0x4b95e6;
const LATE = 0xf43f5e;
const FH = 1.05; // one floor
const PLOT = 17; // a building's plot, roads between

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Built = { slug: string; group: THREE.Group; glass: THREE.MeshPhysicalMaterial; core: THREE.MeshStandardMaterial; pin: THREE.Vector3; late: boolean; hit: THREE.Object3D[] };

export default function OrgCampus({ departments, onOpen }: { departments: MapDepartment[]; onOpen: (slug: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);
  const [hot, setHot] = useState<string | null>(null);
  const hotRef = useRef<string | null>(null);
  useEffect(() => {
    hotRef.current = hot;
  }, [hot]);

  useEffect(() => {
    const host = box.current;
    if (!host || !departments.length) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e13);
    scene.fog = new THREE.Fog(0x0b0e13, 90, 210);
    // reflections from a soft studio, so glass and white read as real
    const pmrem = new THREE.PMREMGenerator(renderer);
    // only the glass and the white catch it; the ground and blocks stay dark
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);

    scene.add(new THREE.HemisphereLight(0xdfeaf7, 0x0b0e13, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-30, 55, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 5, far: 160 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // ---- materials ----
    const white = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.35, metalness: 0.05, envMap: env, envMapIntensity: 0.35 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x8a96a4, roughness: 0.5, metalness: 0.2 });
    const ground = new THREE.MeshStandardMaterial({ color: 0x0f141a, roughness: 0.95 });
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: 0.85 });
    const contextMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.9 });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      return m;
    };
    const rbox = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001));

    // ---- the city: dark ground, a faint grid, roads, quiet blocks ----
    const cols = Math.ceil(departments.length / 2);
    const rows = departments.length > 1 ? 2 : 1;
    const campusW = cols * PLOT;
    const campusD = rows * PLOT;
    const floor = mesh(new THREE.PlaneGeometry(600, 600), ground, 0, 0, 0, false);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(400, 100, 0x1c2430, 0x151b23);
    grid.position.y = 0.01;
    scene.add(grid);
    const r = rng(11);
    const blocks: THREE.Matrix4[] = [];
    for (let x = -150; x <= 150; x += 9)
      for (let z = -150; z <= 150; z += 9) {
        if (Math.abs(x) < campusW / 2 + 6 && Math.abs(z) < campusD / 2 + 6) continue;
        if (r() < 0.35) continue;
        const h = 0.6 + r() * r() * 7;
        blocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 3, h / 2, z + (r() - 0.5) * 3), new THREE.Quaternion(), new THREE.Vector3(3 + r() * 4, h, 3 + r() * 4)));
      }
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), contextMat, blocks.length);
    blocks.forEach((m, i) => city.setMatrixAt(i, m));
    city.receiveShadow = true;
    scene.add(city);

    // ---- one building per department ----
    // A stack of floors: white slabs, a glass band between each, a lit core
    // inside, white fins up the faces. Round when asked.
    function stack(g: THREE.Group, w: number, d: number, floors: number, y0: number, glass: THREE.Material, core: THREE.Material, round = false, x = 0, z = 0) {
      const slabGeo = round ? new THREE.CylinderGeometry(w / 2, w / 2, 0.16, 48) : rbox(w, 0.16, d, 0.08);
      const bandH = FH - 0.16;
      const bandGeo = round ? new THREE.CylinderGeometry(w / 2 - 0.15, w / 2 - 0.15, bandH, 48, 1, true) : new THREE.BoxGeometry(w - 0.3, bandH, d - 0.3);
      for (let f = 0; f < floors; f++) {
        g.add(mesh(slabGeo, white, x, y0 + f * FH + 0.08, z));
        const band = mesh(bandGeo, glass, x, y0 + f * FH + 0.16 + bandH / 2, z, false);
        g.add(band);
      }
      g.add(mesh(slabGeo, white, x, y0 + floors * FH + 0.08, z)); // the roof
      // the lit core, seen through the glass
      const coreGeo = round ? new THREE.CylinderGeometry(w / 2 - 1.1, w / 2 - 1.1, floors * FH - 0.3, 32) : new THREE.BoxGeometry(Math.max(0.6, w - 2.2), floors * FH - 0.3, Math.max(0.6, d - 2.2));
      g.add(mesh(coreGeo, core, x, y0 + (floors * FH) / 2, z, false));
      // white fins up each face
      if (!round) {
        const h = floors * FH;
        const fin = new THREE.BoxGeometry(0.1, h, 0.1);
        const spots: [number, number][] = [];
        for (let fx = -w / 2 + 0.15; fx <= w / 2 - 0.1; fx += 1.4) spots.push([fx, -d / 2 + 0.15], [fx, d / 2 - 0.15]);
        for (let fz = -d / 2 + 0.15; fz <= d / 2 - 0.1; fz += 1.4) spots.push([-w / 2 + 0.15, fz], [w / 2 - 0.15, fz]);
        const fins = new THREE.InstancedMesh(fin, white, spots.length);
        spots.forEach(([fx, fz], i) => fins.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + fx, y0 + h / 2, z + fz)));
        fins.castShadow = true;
        g.add(fins);
      }
      return y0 + floors * FH + 0.16;
    }
    // rooftop plant: a few dark boxes
    function plant(g: THREE.Group, w: number, d: number, y: number, seed: number, x = 0, z = 0) {
      const rr = rng(seed);
      for (let i = 0; i < 3; i++) g.add(mesh(rbox(0.7 + rr() * 1.2, 0.45, 0.7 + rr() * 1, 0.05), darkMetal, x + (rr() - 0.5) * (w - 2), y + 0.22, z + (rr() - 0.5) * (d - 2)));
    }

    const built: Built[] = departments.map((dep, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const px = -campusW / 2 + PLOT / 2 + col * PLOT;
      const pz = -campusD / 2 + PLOT / 2 + row * PLOT;
      const g = new THREE.Group();
      g.position.set(px, 0, pz);
      const late = dep.late > 0;
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x2f5f8f, roughness: 0.1, metalness: 0.35, transparent: true, opacity: 0.82, envMap: env, envMapIntensity: 0.9, emissive: ACCENT, emissiveIntensity: 0.14 });
      const core = new THREE.MeshStandardMaterial({ color: 0x0d1724, emissive: ACCENT, emissiveIntensity: 0.32, roughness: 0.6 });
      // taller for more people
      const size = 3 + Math.min(10, Math.round(dep.people * 1.4));

      // its plaza: a rounded pad with a lit accent edge
      const pad = mesh(rbox(PLOT - 3, 0.18, PLOT - 3, 0.5), plazaMat, 0, 0.09, 0, false);
      g.add(pad);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLOT - 3, 0.01, PLOT - 3)), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25 }));
      edge.position.y = 0.19;
      g.add(edge);

      let top = 0;
      switch (i % 6) {
        case 0: {
          // a tower with a setback
          const y = stack(g, 6, 6, Math.ceil(size * 0.65), 0.18, glass, core);
          top = stack(g, 4.2, 4.2, Math.max(2, Math.floor(size * 0.45)), y, glass, core);
          plant(g, 4.2, 4.2, top, 7);
          break;
        }
        case 1: {
          // a round podium under a slim tower
          const y = stack(g, 10, 10, 3, 0.18, glass, core, true);
          top = stack(g, 4, 4, Math.max(3, size - 2), y, glass, core, false, 1.5, -1);
          plant(g, 4, 4, top, 9, 1.5, -1);
          break;
        }
        case 2: {
          // a long slab
          top = stack(g, 11, 4.5, Math.max(3, Math.ceil(size * 0.7)), 0.18, glass, core);
          plant(g, 11, 4.5, top, 13);
          break;
        }
        case 3: {
          // a stepped terrace
          let y = 0.18;
          const steps = 3;
          for (let s = 0; s < steps; s++) {
            const w = 10 - s * 2.4;
            y = stack(g, w, 8 - s * 1.8, Math.max(2, Math.ceil(size / steps)), y, glass, core);
          }
          top = y;
          break;
        }
        case 4: {
          // twin towers and a bridge
          const fl = Math.max(4, size);
          stack(g, 4, 4, fl, 0.18, glass, core, false, -3, 0);
          top = stack(g, 4, 4, Math.max(3, fl - 2), 0.18, glass, core, false, 3, 0);
          g.add(mesh(rbox(2.2, 0.9, 1.6, 0.1), white, 0, 0.18 + Math.floor(fl * 0.6) * FH, 0));
          plant(g, 4, 4, top, 17, 3, 0);
          break;
        }
        default: {
          // a wide hall
          top = stack(g, 11, 8, Math.max(2, Math.ceil(size * 0.35)), 0.18, glass, core);
          plant(g, 11, 8, top, 19);
        }
      }
      // late work: a red beacon on the roof
      if (late) g.add(mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: LATE }), 0, top + 0.25, 0, false));
      // the pin's line from the roof
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, top, 0), new THREE.Vector3(0, top + 4, 0)]),
        new THREE.LineBasicMaterial({ color: late ? LATE : ACCENT, transparent: true, opacity: 0.7 }),
      );
      g.add(line);
      scene.add(g);
      const hit: THREE.Object3D[] = [];
      g.traverse((o) => o !== line && o !== edge && hit.push(o));
      return { slug: dep.slug, group: g, glass, core, pin: new THREE.Vector3(px, top + 4.2, pz), late, hit };
    });

    // a soft glow on the lit cores
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.45, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const size = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      if (w >= 768) camera.setViewOffset(w, h, 130, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    const ray = new THREE.Raycaster();
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

    const span = Math.max(campusW, campusD * 1.4);
    const dist = span * 1.2 + 14;
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const a = -Math.PI / 4 + (still ? 0 : Math.sin(clock.getElapsedTime() * 0.1) * 0.06);
      camera.position.set(Math.sin(a) * dist, dist * 0.78, Math.cos(a) * dist);
      camera.lookAt(0, 3, 0);

      ray.setFromCamera(pointer, camera);
      const first = ray.intersectObjects(built.flatMap((b) => b.hit), false)[0]?.object;
      const now = first ? (built.find((b) => b.hit.includes(first))?.slug ?? null) : null;
      if (now !== under) {
        under = now;
        renderer.domElement.style.cursor = now ? "pointer" : "default";
        if (pointer.x > -2) setHot(now);
      }
      const lit = hotRef.current;
      for (const b of built) {
        const on = lit === b.slug;
        const dim = !!lit && !on;
        b.glass.emissiveIntensity += ((on ? 0.55 : dim ? 0.05 : 0.14) - b.glass.emissiveIntensity) * 0.12;
        b.core.emissiveIntensity += ((on ? 0.9 : dim ? 0.15 : 0.32) - b.core.emissiveIntensity) * 0.12;
      }
      built.forEach((b, i) => {
        const tag = tags.current[i];
        if (!tag) return;
        v.copy(b.pin).project(camera);
        tag.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * host.clientWidth}px, ${((1 - v.y) / 2) * host.clientHeight}px)`;
        tag.style.opacity = v.z < 1 ? "1" : "0";
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
        mats.forEach((mat) => mat.dispose());
      });
      env.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  const total = departments.reduce((n, d) => ({ people: n.people + d.people, open: n.open + d.open, late: n.late + d.late }), { people: 0, open: 0, late: 0 });

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0e13]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_45%_45%,transparent_55%,rgb(0_0_0/0.55))]" />

      <div className="pointer-events-none absolute top-4 left-5 flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">Easeus Media · Campus</p>
        <div className="flex gap-2">
          {(
            [
              ["People", total.people, false],
              ["Open work", total.open, false],
              ["Late", total.late, total.late > 0],
            ] as const
          ).map(([label, n, bad]) => (
            <div key={label} className="rounded-xl border border-white/[0.08] bg-[#0f1318]/80 px-3 py-1.5 backdrop-blur">
              <p className={`text-base font-semibold tabular-nums ${bad ? "text-rose-300" : "text-foreground"}`}>{n}</p>
              <p className="text-[10.5px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {departments.map((d, i) => (
        <button
          key={d.slug}
          ref={(el) => {
            tags.current[i] = el;
          }}
          type="button"
          onClick={() => onOpen(d.slug)}
          onMouseEnter={() => setHot(d.slug)}
          onMouseLeave={() => setHot(null)}
          style={{ opacity: 0 }}
          className={`absolute top-0 left-0 flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-left whitespace-nowrap backdrop-blur transition-[background-color,border-color,opacity] duration-200 ${
            hot === d.slug ? "border-accent/50 bg-[#10243a]/90" : "border-white/[0.1] bg-[#0f1318]/85"
          }`}
        >
          <span className={`grid size-6 place-items-center rounded-full text-[10px] font-semibold ${d.late ? "bg-rose-400/20 text-rose-300" : "bg-accent/20 text-accent"}`}>{d.people}</span>
          <span className="text-xs font-medium text-foreground">{d.name}</span>
        </button>
      ))}

      <div className="absolute top-4 right-4 bottom-4 hidden w-60 flex-col rounded-2xl border border-white/[0.08] bg-[#0f1318]/80 p-2 backdrop-blur md:flex">
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
