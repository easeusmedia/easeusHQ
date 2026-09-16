// Drag-to-reorder helpers for a list kept in order by a float sortOrder.

// The order after `id` is dropped just before (or after) `target`.
export function moveTo(order: string[], id: string, target: string, after: boolean): string[] {
  const rest = order.filter((x) => x !== id);
  const at = rest.indexOf(target);
  if (at === -1) return order;
  const i = at + (after ? 1 : 0);
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}

// A sortOrder that sits between two neighbours, so a move is one write.
export function sortBetween(before: number | undefined, after: number | undefined): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return 0;
}
