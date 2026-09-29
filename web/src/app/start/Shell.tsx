import Image from "next/image";
import { FileText, Flag, PenLine, UserRound, type LucideIcon } from "lucide-react";
import { SCENE, SUMMIT, SUMMIT_RIDGE } from "./everestRidge";

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
      {/* a fine film grain over the picture, so its gradients blend rather
          than step */}
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.24] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      {/* the card passes pointing through to the picture (the name at the
          summit answers a hover); the form takes it back */}
      <div className="pointer-events-none relative flex w-full max-w-[1120px] rounded-none border-white/[0.12] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] lg:min-h-[640px] lg:rounded-[28px] lg:border lg:p-2.5">
        {/* frosted glass round the edge and between the two halves; only
            the window onto the peak stays clear */}
        <div aria-hidden className="absolute inset-0 hidden rounded-[inherit] bg-[#07090d]/35 backdrop-blur-xl lg:block" style={FRAME_MASK} />
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
        <div className="pointer-events-auto relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#07090d]/80 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[24px] sm:px-10 lg:ml-2.5 lg:rounded-[20px] lg:border lg:border-white/[0.1] lg:px-12 lg:py-12">
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

// Everest at blue hour, filling the screen (public/start/everest.webp,
// rendered by scripts/everest-render.py), with in the same frame so they
// line up: the client's name at the summit, pointing at the top, a halo
// behind it; and now and then a fine glint of light running the ridge, a
// hairline seen only where a soft spot of light passes, so it fades in and
// out at both ends (globals.css, .ev-*; still for reduced motion). The
// summit sits in the left third, where the card's window is.
// The frame's frost: everything but the window, which sits inside the 10px
// padding and is half the width inside it
const FRAME_MASK: React.CSSProperties = {
  maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
  maskSize: "100% 100%, calc(50% - 10px) calc(100% - 20px)",
  maskPosition: "0 0, 10px 10px",
  maskRepeat: "no-repeat",
  maskComposite: "exclude",
  WebkitMaskComposite: "xor",
};

// Stars in the open sky only: above everything, and lower down only clear
// of Everest and Lhotse (x, y, radius, when and how fast each twinkles)
const STARS: [number, number, number, number, number][] = (() => {
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const out: [number, number, number, number, number][] = [];
  while (out.length < 70) {
    const x = r() * 1600;
    const y = r() * 430;
    if (x > 180 && x < 1120 && y > 210) continue;
    out.push([Math.round(x), Math.round(y), 0.5 + r() * 0.9, Math.round(r() * 60) / 10, 3 + Math.round(r() * 40) / 10]);
  }
  return out;
})();

// what the client reads on hovering over their name at the summit
const SUMMIT_NOTE = "This summit has your name on it. We're just here to carry the gear.";

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function Scene({ name }: { name?: string | null }) {
  const { width, height } = SCENE;
  const label = name?.trim();
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="fixed inset-0 h-full w-full"
      pointerEvents="none"
    >
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
        <linearGradient id="sc-foot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="sc-meteor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sc-halo">
          <stop offset="0" stopColor="#7db3f2" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#4b95e6" stopOpacity="0.14" />
          <stop offset="1" stopColor="#4b95e6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <image href="/start/everest.webp" width={width} height={height} />
      <g className="ev-drift" fill="#e8f0ff">
        {STARS.map(([x, y, r, d, t], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="ev-star" style={{ animationDelay: `${d}s`, animationDuration: `${t}s` }} />
        ))}
      </g>
      <line x1="1240" y1="70" x2="1180" y2="92" stroke="url(#sc-meteor)" strokeWidth="1.2" strokeLinecap="round" className="ev-meteor" />
      {/* the foot of the picture sinks into black */}
      <rect width={width} height={height} fill="url(#sc-foot)" />
      <path d={SUMMIT_RIDGE} fill="none" stroke="#eef5ff" strokeWidth="0.9" strokeLinejoin="round" mask="url(#sc-glint)" className="ev-glint" />
      {label && (
        // the client's name at the top: a tag with a dip at the foot, and from
        // it a fine arrow down onto the summit, in a soft halo
        <g transform={`translate(${SUMMIT.x} ${SUMMIT.y})`}>
          <ellipse cx="0" cy="-50" rx="120" ry="60" fill="url(#sc-halo)" className="ev-halo" />
          <g className="ev-arrow">
            <line x1="0" y1="-34" x2="0" y2="-5" stroke="#dcebff" strokeOpacity="0.75" strokeWidth="0.8" />
            <path d="M-3 -9 L0 -4.5 L3 -9" fill="none" stroke="#dcebff" strokeOpacity="0.85" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <foreignObject x="-210" y="-160" width="420" height="119">
            {/* the tag at the foot; hovering it brings up a line for them above */}
            <div className="flex h-full flex-col-reverse items-center">
              {/* made like the Nyra button: the moving light on the wrapper,
                  a solid pill inside it */}
              <span className="ev-tag nyra-glow peer pointer-events-auto relative">
                <span className="relative flex cursor-default items-center gap-2 rounded-full bg-surface-2 px-3.5 py-2 text-[14px] whitespace-nowrap text-foreground shadow-xl">
                  <Flag size={14} className="shrink-0 text-accent" />
                  Hey {label}, we want you here
                  {/* the dip: the tag's foot, pointing down */}
                  <span className="absolute -bottom-[4px] left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-surface-2" />
                </span>
              </span>
              <p className="mb-2.5 max-w-[250px] translate-y-1 rounded-xl border border-white/15 bg-[#0a1322]/85 px-3 py-2 text-center text-[12px] leading-snug text-white/85 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-md transition-[opacity,translate] duration-300 ease-out peer-hover:translate-y-0 peer-hover:opacity-100">
                {SUMMIT_NOTE}
              </p>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}
