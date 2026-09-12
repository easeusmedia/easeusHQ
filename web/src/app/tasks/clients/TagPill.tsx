// A soft tint of the tag's color, not a solid fill — a label, not a
// button. This is the original treatment; the solid-white-text version
// tried in between read as too loud/oversized and got reverted.
export function TagPill({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "xs" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${pad}`}
      style={{ backgroundColor: `${color}26`, borderColor: `${color}4d`, color }}
    >
      {name}
    </span>
  );
}
