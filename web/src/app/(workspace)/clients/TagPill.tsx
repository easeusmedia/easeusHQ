// A soft tint of the tag's color, not a solid fill — a label, not a
// button. No outline, like every other pill in the app. This is the original treatment; the solid-white-text version
// tried in between read as too loud/oversized and got reverted.
export function TagPill({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "xs" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${pad}`}
      style={{ backgroundColor: `${color}24`, color }}
    >
      {name}
    </span>
  );
}
