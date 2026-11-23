// What a project shows before it has a cover: an abstract wash of colour,
// the same for the same project every time, rather than a blank box
// (Abhishek, 23 Nov 2026: "don't just put a blank thing").
const HUES = [212, 198, 228, 250, 270, 186];

function wash(seed: string): string {
  let s = 2166136261;
  for (const ch of seed) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const a = HUES[Math.floor(r() * HUES.length)];
  const b = Math.round(a + 20 + r() * 30);
  const c = HUES[Math.floor(r() * HUES.length)];
  const at = () => `${Math.round(10 + r() * 80)}% ${Math.round(10 + r() * 80)}%`;
  return [
    `radial-gradient(circle at ${at()}, hsl(${a} 75% 60% / 0.55), transparent 55%)`,
    `radial-gradient(circle at ${at()}, hsl(${b} 70% 55% / 0.45), transparent 50%)`,
    `radial-gradient(ellipse at ${at()}, hsl(${c} 65% 65% / 0.3), transparent 45%)`,
    `linear-gradient(${Math.round(r() * 360)}deg, hsl(${a} 45% 16%), hsl(${b} 50% 9%))`,
  ].join(", ");
}

export function AbstractCover({ seed, className = "" }: { seed: string; className?: string }) {
  return <div aria-hidden className={`h-full w-full ${className}`} style={{ background: wash(seed) }} />;
}
