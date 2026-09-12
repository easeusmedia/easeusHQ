// Solid color, white text, small leading dot — matches the reference
// style the user pointed to (a filled chip, not a translucent outline).
export function TagPill({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "xs" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium text-white ${pad}`}
      style={{ backgroundColor: color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
      {name}
    </span>
  );
}
