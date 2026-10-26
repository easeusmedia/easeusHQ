import type { Prisma } from "@prisma/client";
import { moveTo, sortBetween } from "./reorder.ts";

// A client's projects in the order their page lists them (Abhishek, 27 Oct
// 2026): the ones dragged into place by sortOrder, after any never placed,
// which keep the order the page always had (unfinished first, then the most
// recently finished). So nothing moves until someone drags it, and a new
// project still leads.
export const PROJECT_ORDER: Prisma.ProjectOrderByWithRelationInput[] = [
  { sortOrder: { sort: "asc", nulls: "first" } },
  { completedAt: "desc" },
  { createdAt: "desc" },
  // ties (projects finished and made at the same moment) always the same
  // way round, so the page and arrangeProject's renumbering agree
  { id: "asc" },
];

// The order invoices count a client's projects in, whatever order they've
// been dragged into: the one the page always had (unfinished first, then the
// most recently finished). Invoices keep it among projects finished on the
// same day (lib/invoiceBatches), so dragging a card never moves it to
// another invoice.
export function billingOrder(projects: { id: string; completedAt: Date | null; createdAt: Date }[]): string[] {
  const t = (d: Date | null) => d?.getTime() ?? Infinity;
  return [...projects]
    .sort((a, b) => t(b.completedAt) - t(a.completedAt) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((p) => p.id);
}

// A project dragged to just after `before` (or just before `after`, when it
// now leads what's shown), among `order`: every project of the client, as
// listed above. With a filter on, those are its neighbours on screen and the
// projects hidden around them keep their places. Gives the sortOrders to
// save: its own, between its new neighbours, while there's room; otherwise
// every project numbered in the new order (the first move on a client, or a
// gap worn too thin).
export function placeProject(
  order: { id: string; sortOrder: number | null }[],
  id: string,
  before: string | null,
  after: string | null
): { id: string; sortOrder: number }[] {
  const ids = order.map((p) => p.id);
  const next = before ? moveTo(ids, id, before, true) : after ? moveTo(ids, id, after, false) : ids;
  const saved = new Map(order.map((p) => [p.id, p.sortOrder]));
  const at = next.indexOf(id);
  // undefined: no neighbour that side; null: one never placed
  const lo = at > 0 ? saved.get(next[at - 1]) : undefined;
  const hi = at < next.length - 1 ? saved.get(next[at + 1]) : undefined;
  if (lo !== null && hi !== null) {
    const s = sortBetween(lo, hi);
    if ((lo === undefined || s > lo) && (hi === undefined || s < hi)) return saved.get(id) === s ? [] : [{ id, sortOrder: s }];
  }
  return next.flatMap((p, i) => (saved.get(p) === i ? [] : [{ id: p, sortOrder: i }]));
}
