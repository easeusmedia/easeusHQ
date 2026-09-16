import { test } from "node:test";
import assert from "node:assert/strict";
import { moveTo, sortBetween } from "./reorder.ts";

test("a dragged item lands before or after the one it's dropped on", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(moveTo(order, "d", "b", false), ["a", "d", "b", "c"]);
  assert.deepEqual(moveTo(order, "a", "c", true), ["b", "c", "a", "d"]);
  assert.deepEqual(moveTo(order, "a", "zzz", true), order); // unknown target: unchanged
});

test("the new position sits between its neighbours", () => {
  assert.equal(sortBetween(1, 2), 1.5);
  assert.equal(sortBetween(undefined, 1), 0); // moved to the front
  assert.equal(sortBetween(7, undefined), 8); // moved to the end
  assert.equal(sortBetween(undefined, undefined), 0);
});
