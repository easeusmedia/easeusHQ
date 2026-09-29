import Image from "next/image";
import { FileText, Flag, PenLine, UserRound, type LucideIcon } from "lucide-react";
import { SCENE, STARFIELD, SUMMIT, SUMMIT_RIDGE } from "./everestRidge";
import { Parallax } from "./Parallax";

// The frame every /start page sits in, over Everest at blue hour: the
// mountain fills the screen (the goal we help clients reach: the top), with
// the client's own name at the summit, and a glass card sits on it in two
// even halves. On the left, a clear window onto the peak and how this works
// (desktop only); on the right, the page itself on dark frosted glass that
// blurs the range behind it. step: where the client is, lit on the left;
// name: what we called them when the link was made.
const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: UserRound, title: "Your details", body: "Who you are, and who signs." },
  { Icon: FileText, title: "Your agreement", body: "We prepare it from what you share." },
  { Icon: PenLine, title: "Sign online", body: "Adobe emails it to you to sign securely." },
];

export function Shell({ children, step = 1, name }: { children: React.ReactNode; step?: 1 | 2 | 3 | 4; name?: string | null }) {
  return (
    <div className="relative flex min-h-dvh w-full items-stretch justify-center bg-background text-foreground lg:items-center lg:p-10">
      <Scene name={name} />
      {/* the card passes pointing through to the picture (the name at the
          summit answers a hover); the form takes it back */}
      <div className="pointer-events-none relative flex w-full max-w-[1120px] rounded-none border-white/[0.12] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] lg:min-h-[640px] lg:rounded-[28px] lg:border lg:p-2.5">
        {/* frosted glass round the edge and between the two halves; only
            the window onto the peak stays clear */}
        <div aria-hidden className="absolute inset-0 hidden rounded-[inherit] bg-white/[0.03] backdrop-blur-xl backdrop-saturate-[1.6] lg:block" style={FRAME_MASK} />
        {/* the window: nothing between the peak and the eye but a shade
            at the foot, so the words there read */}
        <aside className="relative hidden w-1/2 shrink-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-transparent from-35% via-black/45 via-70% to-black/90 p-9 lg:flex">
          <div className="relative flex items-center gap-2">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>

          <div className="relative mt-auto">
            <p className="text-[22px] font-medium leading-snug tracking-tight">Great content starts with a clear agreement.</p>
            <p className="mt-2 text-sm text-muted">Tell us who you are. We&apos;ll handle the rest.</p>

            <ol className="mt-8 flex flex-col gap-4">
              {STEPS.map(({ Icon, title, body }, i) => {
                const n = i + 1;
                const done = n < step;
                const now = n === step;
                return (
                  <li key={title} className="flex items-center gap-3.5">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        now ? "badge-lit" : done ? "badge-lit emerald" : "badge"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm ${now || done ? "text-foreground" : "text-muted"}`}>{title}</span>
                      <span className="block text-xs text-muted">{body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="relative mt-10 text-xs text-muted/70">Easeus Media: Your New Age Media Distribution Partner.</p>
        </aside>

        {/* dark frosted glass: the range goes soft behind the form, lit
            faintly along its top edge like a pane */}
        <div className="pointer-events-auto relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0b1220]/55 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[28px] backdrop-saturate-150 sm:px-10 lg:ml-2.5 lg:rounded-[20px] lg:border lg:border-white/[0.1] lg:px-12 lg:py-12">
          {/* the sheen a pane of glass catches, top left */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
          {/* on a phone the left side is gone, so the name comes along here */}
          <div className="relative mb-10 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>
          <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

// The frame's frost: everything but the window, which sits inside the
// card's padding (P, 0.625rem) and is half the width inside it. The window
// is a rounded rectangle (20px corners), so the hole is built the same
// way: a bar across, a bar down and a circle in each corner, all taken
// away from the whole, so the frost meets the window's edge all the way
// round, corners included.
const P = "0.625rem";
const CORNER = "radial-gradient(circle 20px, #000 19.5px, transparent 20px)";
const FRAME_MASK: React.CSSProperties = {
  maskImage: ["linear-gradient(#000 0 0)", "linear-gradient(#000 0 0)", "linear-gradient(#000 0 0)", CORNER, CORNER, CORNER, CORNER].join(", "),
  maskSize: [
    "100% 100%",
    `calc(50% - ${P}) calc(100% - 2 * ${P} - 40px)`,
    `calc(50% - ${P} - 40px) calc(100% - 2 * ${P})`,
    "40px 40px",
    "40px 40px",
    "40px 40px",
    "40px 40px",
  ].join(", "),
  maskPosition: [
    "0 0",
    `${P} calc(${P} + 20px)`,
    `calc(${P} + 20px) ${P}`,
    `${P} ${P}`,
    `calc(50% - 20px) ${P}`,
    `${P} calc(100% - ${P})`,
    `calc(50% - 20px) calc(100% - ${P})`,
  ].join(", "),
  maskRepeat: "no-repeat",
  WebkitMaskComposite: "source-out, source-over, source-over, source-over, source-over, source-over, source-over",
  maskComposite: "subtract, add, add, add, add, add, add",
};

// Stars across the sky (x, y, radius, when and how fast each twinkles),
// set behind the land, so none ever shows in front of a mountain
const STARS: [number, number, number, number, number][] = (() => {
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const out: [number, number, number, number, number][] = [];
  while (out.length < 30) {
    const x = r() * 1600;
    const y = r() * 520;
    out.push([Math.round(x), Math.round(y), 0.5 + r() * 0.9, Math.round(r() * 60) / 10, 3 + Math.round(r() * 40) / 10]);
  }
  return out;
})();

// what the client reads on hovering over their name at the summit
const SUMMIT_NOTE = "The summit is waiting, and we're here to take you to the top.";


// Everest at blue hour, filling the screen, in layers that shift a little
// against each other as the pointer moves (public/start/everest/*.svg,
// drawn by scripts/everest-scene.mjs): the sky with the dawn in it, the
// stars turning slowly, the far ranges, Everest with the client's message
// on its summit and a fine glint now and then along its ridge, and the near
// ridges; over it all, holding still, a fade at the foot and a vignette
// (globals.css, .ev-*; still for reduced motion). The summit sits in the
// left third, where the card's window is.
function Scene({ name }: { name?: string | null }) {
  const { width, height } = SCENE;
  const label = name?.trim();
  // the night sky's box, in the picture's own units: drawn larger than the
  // picture so turning never shows an edge
  const gx = (width - STARFIELD.width) / 2;
  const gy = (height - STARFIELD.height) / 2;
  // the far-off point the sky turns about, within that box
  const pivot = { x: 1500 - gx, y: -700 - gy };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  // where a point of the picture lands inside a layer: the picture covers
  // the layer from its middle, at whichever scale fills it
  const scale = `max(100cqw / ${width}, 100cqh / ${height})`;
  const at = (x: number, y: number) => ({
    left: `calc(50% + ${x - width / 2} * ${scale})`,
    top: `calc(50% + ${y - height / 2} * ${scale})`,
  });
  // A message over the peak: a box with a small pointer in the middle of
  // its foot, the pointer's tip on the summit. Plain HTML pinned to the
  // summit (not drawn inside the picture, which would shrink it with the
  // picture and thin its edge to nothing at the corners). Its edge is its
  // own border, with the Nyra light running round it and a soft blue glow
  // following the light. It floats, hops now and then for attention, and
  // hovering it brings up a line above, which stays while the pointer is
  // on either. The client's name is always capitalised, however it was
  // typed.
  const TAG = (
    <div className="absolute" style={at(SUMMIT.x, SUMMIT.y)}>
      <div className="absolute bottom-2 left-0 -translate-x-1/2">
        <div className="ev-bob ev-hold group flex flex-col-reverse items-center">
          <span className="ev-tag pointer-events-auto relative isolate">
            <span aria-hidden className="ev-box-glow absolute -inset-[3px] -z-10 rounded-[13px]" />
            <span className="ev-box relative flex cursor-default items-center gap-2 rounded-[11px] px-3.5 py-2 text-[14px] whitespace-nowrap text-foreground">
              <Flag size={14} className="shrink-0 text-accent" />
              <span>
                Hey <span className="capitalize">{label}</span>, we want you here
              </span>
            </span>
            {/* the pointer: the box's own fill, and its edge colour */}
            <span className="absolute top-full left-1/2 -mt-[6.5px] size-3 -translate-x-1/2 rotate-45 border-r border-b border-[#2a4a72] bg-surface-2" />
          </span>
          {/* padding, not margin, below the line: the pointer can cross from
              the box to it without letting go */}
          <span className="pointer-events-none translate-y-1 pb-3 opacity-0 transition-[opacity,translate] delay-150 duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-0">
            <span className="block w-max max-w-[260px] rounded-xl border border-white/15 bg-[#0a1322]/90 px-3 py-2 text-center text-[12px] leading-snug text-white/85">
              {SUMMIT_NOTE}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <Parallax />
      {/* 1. the sky, with the dawn in it, and a soft glow round the dawn
          that breathes slowly: a rose haze high up, and warm light pooled on
          the horizon */}
      <Layer depth={0.2} src="sky">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="ev-dawn absolute inset-0 h-full w-full mix-blend-screen">
          <defs>
            <radialGradient id="sc-dawn-haze">
              <stop offset="0" stopColor="#f6b39a" stopOpacity="0.2" />
              <stop offset="0.45" stopColor="#b77aa6" stopOpacity="0.08" />
              <stop offset="1" stopColor="#6f5aa8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sc-dawn-glow">
              <stop offset="0" stopColor="#ffd8ae" stopOpacity="0.6" />
              <stop offset="0.3" stopColor="#ffab73" stopOpacity="0.3" />
              <stop offset="0.65" stopColor="#e27f7a" stopOpacity="0.09" />
              <stop offset="1" stopColor="#e27f7a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="300" cy="470" rx="920" ry="330" fill="url(#sc-dawn-haze)" />
          <ellipse cx="270" cy="515" rx="560" ry="160" fill="url(#sc-dawn-glow)" />
        </svg>
      </Layer>

      {/* 2. the night sky, turning slowly on its own layer (the browser
          turns it without redrawing it), behind the land */}
      <Layer depth={0.2}>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: `max(100cqw, ${(width / height) * 100}cqh)`, height: `max(100cqh, ${(height / width) * 100}cqw)` }}
        >
          <div
            className="ev-sky absolute"
            style={{
              left: pct(gx, width),
              top: pct(gy, height),
              width: pct(STARFIELD.width, width),
              height: pct(STARFIELD.height, height),
              transformOrigin: `${pct(pivot.x, STARFIELD.width)} ${pct(pivot.y, STARFIELD.height)}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a vector file */}
            <img src="/start/everest-stars.svg" alt="" className="h-full w-full" />
            <svg viewBox={`0 0 ${STARFIELD.width} ${STARFIELD.height}`} className="absolute inset-0 h-full w-full" fill="#e8f0ff">
              {STARS.map(([x, y, r, d, t], i) => (
                <circle key={i} cx={x - gx} cy={y - gy} r={r} className="ev-star" style={{ animationDelay: `${d}s`, animationDuration: `${t}s` }} />
              ))}
            </svg>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="sc-meteor" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="1240" y1="70" x2="1180" y2="92" stroke="url(#sc-meteor)" strokeWidth="1.2" strokeLinecap="round" className="ev-meteor" />
          </svg>
        </div>
      </Layer>

      {/* 3. the far ranges, the dawn's light spilling softly over their
          tops */}
      <Layer depth={0.4} src="far">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="ev-dawn absolute inset-0 h-full w-full mix-blend-screen">
          <defs>
            <radialGradient id="sc-dawn-spill">
              <stop offset="0" stopColor="#ffd9b0" stopOpacity="0.32" />
              <stop offset="0.5" stopColor="#ff9f6e" stopOpacity="0.1" />
              <stop offset="1" stopColor="#ff9f6e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="260" cy="522" rx="380" ry="80" fill="url(#sc-dawn-spill)" />
        </svg>
      </Layer>

      {/* 4. Everest, with the glint on its ridge and the message on its
          summit, which move with it */}
      <Layer depth={0.7} src="peak">
        <svg aria-hidden viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" pointerEvents="none">
          <defs>
            <radialGradient id="sc-spot">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="sc-glint" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
              <circle r="55" fill="url(#sc-spot)">
                <animateMotion dur="12s" begin="2s" repeatCount="indefinite" path={SUMMIT_RIDGE} keyPoints="0;1;1" keyTimes="0;0.55;1" calcMode="linear" />
                <animate attributeName="opacity" dur="12s" begin="2s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.1;0.45;0.55;1" />
              </circle>
            </mask>
            <radialGradient id="sc-halo">
              <stop offset="0" stopColor="#7db3f2" stopOpacity="0.4" />
              <stop offset="0.5" stopColor="#4b95e6" stopOpacity="0.12" />
              <stop offset="1" stopColor="#4b95e6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d={SUMMIT_RIDGE} fill="none" stroke="#eef5ff" strokeWidth="0.9" strokeLinejoin="round" mask="url(#sc-glint)" className="ev-glint" />
          {label && (
            <g transform={`translate(${SUMMIT.x} ${SUMMIT.y})`}>
              <ellipse cx="0" cy="-40" rx="130" ry="60" fill="url(#sc-halo)" className="ev-halo" />
            </g>
          )}
        </svg>
        {label && TAG}
      </Layer>

      {/* 5. the near ridges */}
      <Layer depth={1} src="near" />

      {/* 6. over it all, holding still: the foot of the picture sinks into
          black, and everything away from the peak falls into shadow, so the
          eye goes to the form */}
      <svg aria-hidden viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="pointer-events-none fixed inset-0 h-full w-full">
        <defs>
          <radialGradient id="sc-vignette" cx={SUMMIT.x + 60} cy="380" r="1050" gradientUnits="userSpaceOnUse">
            <stop offset="0.35" stopColor="#000" stopOpacity="0" />
            <stop offset="0.75" stopColor="#000" stopOpacity="0.28" />
            <stop offset="1" stopColor="#000" stopOpacity="0.5" />
          </radialGradient>
          <linearGradient id="sc-foot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#sc-foot)" />
        <rect width={width} height={height} fill="url(#sc-vignette)" />
      </svg>
    </>
  );
}

// One layer of the scene: a little larger than the screen (24px each
// side), so shifting it never shows an edge, and moved by the pointer in
// proportion to its depth (globals.css, .ev-layer; Parallax.tsx). src: one
// of the scene's files, drawn to cover the layer; children sit in the same
// frame.
function Layer({ depth, src, children }: { depth: number; src?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden className="ev-layer pointer-events-none fixed -inset-6 overflow-hidden [container-type:size]" style={{ "--ev-depth": depth } as React.CSSProperties}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a vector file; there's nothing for next/image to optimise
        <img src={`/start/everest/${src}.svg`} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {children}
    </div>
  );
}
