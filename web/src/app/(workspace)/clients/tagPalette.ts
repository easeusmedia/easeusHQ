// Shared between actions.ts (validates against it) and the tag-creation UI
// (renders it as swatches) — not in actions.ts itself since a "use server"
// file can only export async functions, not plain constants.
export const TAG_PALETTE = [
  "#60a5fa", // blue
  "#a78bfa", // purple
  "#34d399", // green
  "#fbbf24", // amber
  "#fb7185", // rose
  "#38bdf8", // sky
  "#f472b6", // pink
  "#a3a3a3", // neutral
];
