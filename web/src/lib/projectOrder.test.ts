import { test } from "node:test";
import assert from "node:assert/strict";
import { billingOrder, placeProject } from "./projectOrder.ts";

const list = (...p: [string, number | null][]) => p.map(([id, sortOrder]) => ({ id, sortOrder }));

test("a dragged project takes a sortOrder between its new neighbours", () => {
  const order = list(["a", 0], ["b", 1], ["c", 2], ["d", 3]);
  assert.deepEqual(placeProject(order, "d", "a", "b"), [{ id: "d", sortOrder: 0.5 }]);
  assert.deepEqual(placeProject(order, "c", null, "a"), [{ id: "c", sortOrder: -1 }]); // to the front
  assert.deepEqual(placeProject(order, "a", "d", null), [{ id: "a", sortOrder: 4 }]); // to the end
  assert.deepEqual(placeProject(order, "b", "a", "c"), []); // where it already was
  // a filter hid c: dropped after b on screen, it goes just after b in the full list
  assert.deepEqual(placeProject(order, "a", "b", "d"), [{ id: "a", sortOrder: 1.5 }]);
});

test("never-placed projects get numbered in the new order on the first move", () => {
  const order = list(["a", null], ["b", null], ["c", null]);
  assert.deepEqual(placeProject(order, "c", "a", "b"), [
    { id: "a", sortOrder: 0 },
    { id: "c", sortOrder: 1 },
    { id: "b", sortOrder: 2 },
  ]);
  // a new project leads the placed ones; dropped among them, only it is written
  const mixed = list(["n", null], ["a", 0], ["b", 1]);
  assert.deepEqual(placeProject(mixed, "n", "a", "b"), [{ id: "n", sortOrder: 0.5 }]);
  // ahead of the new one: all numbered again
  assert.deepEqual(placeProject(mixed, "b", null, "n"), [
    { id: "b", sortOrder: 0 },
    { id: "n", sortOrder: 1 },
    { id: "a", sortOrder: 2 },
  ]);
});

test("a gap worn too thin to split numbers them all again", () => {
  const order = list(["a", 1], ["b", 1 + Number.EPSILON], ["c", 5]);
  assert.deepEqual(placeProject(order, "c", "a", "b"), [
    { id: "a", sortOrder: 0 },
    { id: "c", sortOrder: 1 },
    { id: "b", sortOrder: 2 },
  ]);
});

test("invoices count projects in the order they always had, not the dragged one", () => {
  const d = (s: string) => new Date(s);
  const projects = [
    { id: "b", completedAt: d("2026-03-06T09:00Z"), createdAt: d("2026-03-01") },
    { id: "open", completedAt: null, createdAt: d("2026-01-01") },
    { id: "c", completedAt: d("2026-03-06T09:00Z"), createdAt: d("2026-03-01") },
    { id: "a", completedAt: d("2026-03-06T12:00Z"), createdAt: d("2026-02-01") },
  ];
  assert.deepEqual(billingOrder(projects), ["open", "a", "b", "c"]);
});
