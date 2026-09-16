import { test } from "node:test";
import assert from "node:assert/strict";
import { perRow } from "./perRow.ts";

test("columns spread into even rows, never more than there are", () => {
  assert.equal(perRow(200, 6, 9.5), 6); // all fit
  assert.equal(perRow(4 * 10.5 - 1, 6, 9.5), 3); // four fit → 3 + 3
  assert.equal(perRow(5 * 10.5 - 1, 6, 9.5), 3); // five fit → 3 + 3, not 5 + 1
  assert.equal(perRow(6 * 10.5 - 1, 6, 9.5), 6);
  assert.equal(perRow(0, 6, 9.5), 1);
  assert.equal(perRow(0, 1, 12), 1);
  assert.equal(perRow(3 * 11 - 1, 7, 10), 3); // 3 + 3 + 1 is the best 3 can do
});
