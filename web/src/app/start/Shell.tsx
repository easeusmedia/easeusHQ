import Image from "next/image";
import { FileText, Flag, PenLine, UserRound, type LucideIcon } from "lucide-react";
import { SCENE, SUMMIT, SUMMIT_RIDGE, TWINKLES } from "./everestRidge";

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
        <div aria-hidden className="absolute inset-0 hidden rounded-[inherit] bg-[#07090d]/35 backdrop-blur-xl lg:block" style={FRAME_MASK} />
        {/* the window: nothing between the peak and the eye but a shade
            at the foot, so the words there read */}
        <aside className="relative hidden w-1/2 shrink-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-transparent from-45% via-black/25 via-70% to-black/65 p-9 lg:flex">
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

// what the client reads on hovering over their name at the summit
const SUMMIT_NOTE = "You bring the vision. We'll handle the climb.";


// Everest by night, filling the screen (public/start/everest.webp, drawn by
// scripts/everest-scene.mjs), with in the same frame so they line up: the
// stars that twinkle, one that falls now and then, a glint of light running
// the summit ridge, and a message for the client planted on the summit
// (globals.css, .ev-*; still for reduced motion). Nothing large moves, so
// nothing large is redrawn: zooming stays clean, and the glass over it has
// nothing to keep re-blurring.
function Scene({ name }: { name?: string | null }) {
  const { width, height } = SCENE;
  const label = name?.trim();
  // where a point of the picture lands on screen: the picture covers the
  // screen from its middle, at whichever scale fills it
  const scale = `max(100cqw / ${width}, 100cqh / ${height})`;
  const at = (x: number, y: number) => ({
    left: `calc(50% + ${x - width / 2} * ${scale})`,
    top: `calc(50% + ${y - height / 2} * ${scale})`,
  });
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- already sized and compressed for the screen by the script */}
      <img src="/start/everest.webp" alt="" aria-hidden fetchPriority="high" decoding="async" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />

      <svg
        aria-hidden
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none fixed inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="sc-meteor" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sc-vignette" cx={SUMMIT.x + 60} cy="380" r="1050" gradientUnits="userSpaceOnUse">
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="0.8" stopColor="#000" stopOpacity="0.14" />
            <stop offset="1" stopColor="#000" stopOpacity="0.32" />
          </radialGradient>
          <linearGradient id="sc-foot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {/* the foot of the picture and its far edges fall a little into
            shadow, so the eye goes to the peak and the form */}
        <rect width={width} height={height} fill="url(#sc-foot)" />
        <rect width={width} height={height} fill="url(#sc-vignette)" />
        <g fill="#f2f6ff">
          {TWINKLES.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r + 0.15} className="ev-star" style={{ animationDelay: `${(i * 0.37) % 6}s`, animationDuration: `${3 + ((i * 0.53) % 4)}s` }} />
          ))}
        </g>
        <line x1="1240" y1="70" x2="1180" y2="92" stroke="url(#sc-meteor)" strokeWidth="1.2" strokeLinecap="round" className="ev-meteor" />
        {/* first light running up the ridge to the top and down the far side */}
        <path d={SUMMIT_RIDGE} pathLength={100} fill="none" stroke="#f4f8ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="ev-glint" />
      </svg>

      {/* grain over the picture, a small tile, against banding */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[url(/start/grain.png)] bg-[length:160px]" />

      {label && (
        // A message planted on the summit: a box with a small pointer in
        // the middle of its foot, the tip on the peak. One thin blue stroke
        // with the Nyra button's light running round it. It springs up
        // from the peak as the page opens, gives a quick hop now and then,
        // and hovering it brings up a line above.
        <div aria-hidden className="pointer-events-none fixed inset-0 [container-type:size]">
          <div className="absolute" style={at(SUMMIT.x, SUMMIT.y)}>
            <div className="absolute bottom-1.5 left-0 flex -translate-x-1/2 flex-col-reverse items-center">
              <span className="ev-tag peer pointer-events-auto relative">
                <span className="nyra-glow nyra-line relative block rounded-[11px] bg-[#2a4a72] p-px">
                  <span className="flex cursor-default items-center gap-2 rounded-[10px] bg-surface-2 px-3.5 py-2 text-[14px] whitespace-nowrap text-foreground">
                    <Flag size={14} className="shrink-0 text-accent" />
                    {label}, we&apos;re here to take you to the top
                  </span>
                </span>
                {/* the pointer: the box's own fill and stroke */}
                <span className="absolute top-full left-1/2 -mt-[6.5px] size-3 -translate-x-1/2 rotate-45 border-r border-b border-[#2a4a72] bg-surface-2" />
              </span>
              <p className="mb-3 w-max max-w-[260px] translate-y-1 rounded-xl border border-white/15 bg-[#0a1322]/90 px-3 py-2 text-center text-[12px] leading-snug text-white/85 opacity-0 transition-[opacity,translate] duration-300 ease-out peer-hover:translate-y-0 peer-hover:opacity-100">
                {SUMMIT_NOTE}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
