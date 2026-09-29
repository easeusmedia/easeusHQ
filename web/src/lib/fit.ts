// Where a menu goes across the window, so it's never cut off at either
// side: as wide as its trigger or its own width, whichever is more, but
// never wider than the window allows; lined up with the trigger's left edge
// (or its right edge, for `end`, or when there isn't room to the right);
// and always inside the window by a margin.
export type Fit = { left: number; width: number };

export function fitAcross(
  trigger: { left: number; right: number; width: number },
  viewport: number,
  { width: wanted = 0, align = "start", margin = 8 }: { width?: number; align?: "start" | "end"; margin?: number } = {}
): Fit {
  const width = Math.min(Math.max(trigger.width, wanted), viewport - margin * 2);
  const startFits = trigger.left + width <= viewport - margin;
  const left = align === "end" || !startFits ? trigger.right - width : trigger.left;
  return { left: Math.max(margin, Math.min(left, viewport - width - margin)), width };
}
