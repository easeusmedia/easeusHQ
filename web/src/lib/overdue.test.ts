import { test } from "node:test";
import assert from "node:assert/strict";
import { ordinal, overdueAudience } from "./overdue.ts";

test("Level 3: their Level 2 hears every time; Level 1 from the third", () => {
  assert.deepEqual(overdueAudience(1, "employee"), { leads: true, levelOne: false });
  assert.deepEqual(overdueAudience(2, "employee"), { leads: true, levelOne: false });
  assert.deepEqual(overdueAudience(3, "employee"), { leads: true, levelOne: true });
});

test("Level 2: only them the first time; Level 1 from the second", () => {
  assert.deepEqual(overdueAudience(1, "core"), { leads: false, levelOne: false });
  assert.deepEqual(overdueAudience(2, "core"), { leads: false, levelOne: true });
  assert.deepEqual(overdueAudience(5, "admin"), { leads: false, levelOne: false });
});

test("ordinals", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
});
