"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { MapDepartment } from "./OrgMap";

// The company as one office floor, after smart-building dashboards: an
// isometric plan where each department is a room, a desk per person, its
// floor lit in the accent blue (red while it has late work), a pin above
// it with its name and numbers, and a panel listing them all beside it.
// Pointing at a room (or its row) lights it; a click opens it.

const ACCENT = 0x4b95e6;
const LATE = 0xf43f5e;
const ROOM_W = 10;
const ROOM_D = 7.5;
const HALL = 3.2; // the corridor between the two rows of rooms
const WALL_H = 1.1;

// a steady scatter, so the desks sit the same way every time
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Room = { slug: string; glow: THREE.Mesh; edge: THREE.LineSegments; pin: THREE.Vector3; late: boolean };

export default function OrgFloor({ departments, onOpen }: { departments: MapDepartment[]; onOpen: (slug: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);
  // the room under the pointer, or under the list row being pointed at
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    renderer.domElement.className = "absolute inset-0 h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e13);
    const camera = new THREE.PerspectiveCamera(28, 1, 1, 400);

    scene.add(new THREE.HemisphereLight(0xd6e6f7, 0x10151c, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-18, 40, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 5, far: 120 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ---- the floor: two rows of rooms either side of a corridor ----
    const cols = Math.ceil(departments.length / 2);
    const width = cols * ROOM_W;
    const depth = 2 * ROOM_D + HALL;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width + 3, 0.5, depth + 3),
      new THREE.MeshStandardMaterial({ color: 0x181e26, roughness: 0.9 }),
    );
    slab.position.y = -0.25;
    slab.receiveShadow = true;
    scene.add(slab);
    // the slab's lit rim
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x2a3644 }));
    rim.position.copy(slab.position);
    scene.add(rim);

    const path = new THREE.Mesh(new THREE.BoxGeometry(width - 1, 0.03, 0.08), new THREE.MeshBasicMaterial({ color: ACCENT }));
    path.position.set(0, 0.03, 0);
    scene.add(path);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.7 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x3b4a5c, emissive: 0x3b4a5c, emissiveIntensity: 0.35, roughness: 0.5 });
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x2b333e, roughness: 0.6 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.8 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0e1622, emissive: ACCENT, emissiveIntensity: 1.1 });

    const wall = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
      m.position.set(x, WALL_H / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), capMat);
      cap.position.set(x, WALL_H + 0.025, z);
      scene.add(cap);
    };

    const rooms: Room[] = departments.map((d, i) => {
      const row = i % 2; // 0: far side of the corridor, 1: near side
      const col = Math.floor(i / 2);
      const cx = -width / 2 + ROOM_W / 2 + col * ROOM_W;
      const cz = row === 0 ? -(HALL / 2 + ROOM_D / 2) : HALL / 2 + ROOM_D / 2;
      const late = d.late > 0;
      const tone = late ? LATE : ACCENT;

      // its floor, faintly lit
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W - 0.5, ROOM_D - 0.5),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.06, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(cx, 0.02, cz);
      glow.userData.slug = d.slug;
      scene.add(glow);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(ROOM_W - 0.5, ROOM_D - 0.5)),
        new THREE.LineBasicMaterial({ color: tone, transparent: true, opacity: 0.45 }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(cx, 0.04, cz);
      scene.add(edge);

      // walls round it, with a doorway onto the corridor
      const t = 0.14;
      const back = row === 0 ? cz - ROOM_D / 2 : cz + ROOM_D / 2;
      const front = row === 0 ? cz + ROOM_D / 2 : cz - ROOM_D / 2;
      wall(ROOM_W, t, cx, back);
      wall(t, ROOM_D, cx - ROOM_W / 2, cz);
      if (col === cols - 1) wall(t, ROOM_D, cx + ROOM_W / 2, cz);
      const door = 2.2;
      const side = (ROOM_W - door) / 2;
      wall(side, t, cx - ROOM_W / 2 + side / 2, front);
      wall(side, t, cx + ROOM_W / 2 - side / 2, front);

      // a desk per person (at least two, at most twelve), monitors lit
      const r = rng(31 + i * 17);
      const seats = Math.max(2, Math.min(12, d.people));
      const perRow = Math.min(4, seats);
      for (let k = 0; k < seats; k++) {
        const gx = k % perRow;
        const gz = Math.floor(k / perRow);
        const x = cx - ((perRow - 1) * 2.1) / 2 + gx * 2.1;
        const z = (row === 0 ? cz - 2.2 + gz * 1.9 : cz + 2.2 - gz * 1.9) + (r() - 0.5) * 0.1;
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), deskMat);
        desk.position.set(x, 0.72, z);
        desk.castShadow = true;
        scene.add(desk);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.68, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a2028 }));
        legs.position.set(x, 0.34, z);
        legs.castShadow = true;
        scene.add(legs);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.04), screenMat);
        screen.position.set(x, 1.0, z - 0.25);
        scene.add(screen);
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), chairMat);
        chair.position.set(x, 0.25, z + 0.75);
        chair.castShadow = true;
        scene.add(chair);
      }

      return { slug: d.slug, glow, edge, pin: new THREE.Vector3(cx, WALL_H + 2.6, cz), late };
    });

    // a soft glow on lit screens and edges
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 0.7);
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

    // pointing and clicking
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

    // the view: isometric, from the near left, swaying a touch
    const span = Math.max(width, depth * 1.6);
    const dist = span * 1.3 + 12;
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const a = -Math.PI / 4 + (still ? 0 : Math.sin(clock.getElapsedTime() * 0.12) * 0.05);
      camera.position.set(Math.sin(a) * dist, dist * 0.82, Math.cos(a) * dist);
      camera.lookAt(0, 0, 1);

      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(rooms.map((r) => r.glow))[0]?.object;
      const now = (hit?.userData.slug as string | undefined) ?? null;
      if (now !== under) {
        under = now;
        renderer.domElement.style.cursor = now ? "pointer" : "default";
        if (pointer.x > -2) setHot(now);
      }
      const t = clock.getElapsedTime();
      for (const room of rooms) {
        const lit = hotRef.current === room.slug;
        (room.glow.material as THREE.MeshBasicMaterial).opacity = lit ? 0.2 : 0.06;
        // a late room's red outline breathes, so it's noticed without shouting
        (room.edge.material as THREE.LineBasicMaterial).opacity = lit ? 0.95 : room.late ? 0.45 + 0.3 * Math.sin(t * 2.4) : 0.35;
      }

      rooms.forEach((room, i) => {
        const tag = tags.current[i];
        if (!tag) return;
        v.copy(room.pin).project(camera);
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
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [departments, onOpen]);

  const total = departments.reduce((n, d) => ({ people: n.people + d.people, open: n.open + d.open, late: n.late + d.late }), { people: 0, open: 0, late: 0 });

  return (
    <div ref={box} className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0e13]">
      {/* a soft light from the top, and darker edges */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_45%_35%,rgb(75_149_230/0.08),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_55%,rgb(0_0_0/0.55))]" />

      {/* the floor's name and totals */}
      <div className="pointer-events-none absolute top-4 left-5 flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">Easeus Media · Floor plan</p>
        <div className="flex gap-2">
          {[
            ["People", total.people, false],
            ["Open work", total.open, false],
            ["Late", total.late, total.late > 0],
          ].map(([label, n, bad]) => (
            <div key={label as string} className="rounded-xl border border-white/[0.08] bg-[#0f1318]/80 px-3 py-1.5 backdrop-blur">
              <p className={`text-base font-semibold tabular-nums ${bad ? "text-rose-300" : "text-foreground"}`}>{n as number}</p>
              <p className="text-[10.5px] text-muted">{label as string}</p>
            </div>
          ))}
        </div>
      </div>

      {/* a pin over each room */}
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

      {/* every department, as a list beside the plan */}
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
