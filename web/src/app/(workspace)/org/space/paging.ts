import { useState } from "react";

// A Sales board shows its leads ten at a time: a stage (or the list, or the
// table) shows its first 10, and each Show more adds the next 10 (Abhishek,
// 26 Oct 2026). How many each group shows, by its key:
export const PAGE = 10;
export type Limits = Record<string, number>;

// ten more than the group shows now
export const nextPage = (limits: Limits, group: string): Limits => ({ ...limits, [group]: (limits[group] ?? PAGE) + PAGE });
// at least `n` (a card dropped past the page's end stays in view), never fewer
export const showAtLeast = (limits: Limits, group: string, n: number): Limits => (n > (limits[group] ?? PAGE) ? { ...limits, [group]: n } : limits);

// The list and the table page each stage on its own too, so a big first
// stage never buries the rest: the rows (in stage order) by group, each
// group's rows that show and whether it has more
export const pageByGroup = <T>(rows: T[], groupOf: (row: T) => string, limit: (group: string) => number) =>
  [...Map.groupBy(rows, groupOf)].map(([group, all]) => ({ group, shown: all.slice(0, limit(group)), more: all.length > limit(group) }));

// The groups' limits, back to 10 each when `reset` changes (a new search,
// filter, tab or board)
export function usePaging(reset: string) {
  const [state, setState] = useState<{ for: string; limits: Limits }>({ for: reset, limits: {} });
  const limits = state.for === reset ? state.limits : {};
  const update = (fn: (l: Limits) => Limits) => setState((prev) => ({ for: reset, limits: fn(prev.for === reset ? prev.limits : {}) }));
  return {
    limit: (group = "") => limits[group] ?? PAGE,
    more: (group = "") => update((l) => nextPage(l, group)),
    atLeast: (group: string, n: number) => update((l) => showAtLeast(l, group, n)),
  };
}
