import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPage, PAGE, pageByGroup, showAtLeast } from "./paging.ts";

test("a group starts at 10 and each Show more adds 10", () => {
  const once = nextPage({}, "dream");
  assert.equal(once.dream, PAGE * 2);
  assert.equal(nextPage(once, "dream").dream, PAGE * 3);
  // other stages keep their own count
  assert.equal(nextPage(once, "day-1").dream, PAGE * 2);
});

test("a card dropped past the end grows its stage by one, never shrinks it", () => {
  assert.deepEqual(showAtLeast({}, "dream", PAGE + 1), { dream: PAGE + 1 });
  const limits = { dream: 30 };
  assert.equal(showAtLeast(limits, "dream", 4), limits);
  assert.equal(showAtLeast({}, "dream", PAGE).dream, undefined);
});

test("each stage pages on its own, so a big first stage doesn't hide the rest", () => {
  const rows = [...Array.from({ length: 25 }, () => "dream"), "day-1", "day-1"];
  const pages = pageByGroup(rows, (r) => r, (g) => (g === "dream" ? 20 : PAGE));
  assert.deepEqual(
    pages.map((p) => [p.group, p.shown.length, p.more]),
    [
      ["dream", 20, true],
      ["day-1", 2, false],
    ],
  );
});
