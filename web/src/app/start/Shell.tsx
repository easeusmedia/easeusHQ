import Image from "next/image";

// The frame every /start page sits in: a dark card on a soft slate ground,
// artwork on the left (desktop only), the page itself on the right.

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-stretch justify-center bg-[#0b0b0b] text-[#ededed] lg:items-center lg:bg-[#8f99a8] lg:p-10">
      <div className="flex w-full max-w-[1120px] rounded-none bg-[#0b0b0b] lg:min-h-[660px] lg:rounded-[22px] lg:p-2.5 lg:shadow-[0_40px_120px_-40px_rgba(0,0,0,0.55)]">
        <Artwork />
        <div className="flex min-w-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
          {/* on a phone the artwork's gone, so the name comes along here */}
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>
          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Drawn, not photographed: a soft blue glow rising under fine vertical
// lines, with a little grain — calm, architectural, on brand.
function Artwork() {
  const grain =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";
  return (
    <div className="relative hidden w-[47%] shrink-0 overflow-hidden rounded-[16px] lg:block">
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(95% 55% at 50% 108%, rgba(122,165,216,0.62) 0%, rgba(122,165,216,0.16) 48%, transparent 72%)",
            "radial-gradient(70% 45% at 88% -5%, rgba(220,228,242,0.20) 0%, transparent 62%)",
            "linear-gradient(180deg, #1a1d23 0%, #0d0f13 100%)",
          ].join(","),
        }}
      />
      {/* the lines lean in, like a façade seen from below */}
      <div
        className="absolute -inset-x-1/4 top-[-10%] bottom-[18%] origin-bottom"
        style={{
          background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 18px)",
          transform: "perspective(900px) rotateX(24deg)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 35%, black 60%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 35%, black 60%, transparent 100%)",
        }}
      />
      <div className="absolute inset-0 opacity-[0.16] mix-blend-overlay" style={{ backgroundImage: grain }} />

      <div className="absolute left-7 top-7 flex items-center gap-2">
        <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
        <span className="text-[13px] font-medium tracking-tight text-white/90">Easeus Media</span>
      </div>
      <div className="absolute inset-x-8 bottom-10 text-center">
        <p className="text-[19px] leading-[1.45] tracking-tight text-white/95">
          Great content starts with a clear agreement.
          <br />
          Tell us who you are — we&apos;ll handle the rest.
        </p>
        <p className="mt-4 text-[12px] text-white/45">Easeus Media — video for people worth listening to.</p>
      </div>
    </div>
  );
}
