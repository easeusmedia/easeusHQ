import { test } from "node:test";
import assert from "node:assert/strict";
import { categorise, STARTING_KEYWORDS } from "./categorise.ts";

const CATS = Object.entries(STARTING_KEYWORDS).map(([name, keywords]) => ({ name, keywords }));

test("a comment goes to the category whose keywords it uses", () => {
  assert.deepEqual(categorise("There's a typo in the second line", CATS), { kind: "mistake", category: "Typos" });
  assert.deepEqual(categorise("Use UK spelling: organisation", CATS), { kind: "mistake", category: "UK/US spelling" });
  assert.deepEqual(categorise("Change the bgm here, it's not the vibe", CATS), { kind: "mistake", category: "Creative" });
  assert.deepEqual(categorise("The Website is shaking in the beginning?", CATS), { kind: "mistake", category: "Visual glitches" });
  assert.deepEqual(categorise("Subtitles are out of sync", CATS), { kind: "mistake", category: "Subtitles" });
});

test("whole words only: 'subs' isn't found inside 'subscribe'", () => {
  assert.notEqual(categorise("Add a subscribe button at the end please", CATS).category, "Subtitles");
});

test("praise is praise; a word or two that matches nothing isn't feedback; the rest goes to Others", () => {
  assert.deepEqual(categorise("Nice!!!", CATS), { kind: "praise", category: null });
  assert.deepEqual(categorise("Because", CATS), { kind: "note", category: null });
  assert.deepEqual(categorise("Can we make this part slightly shorter", CATS), { kind: "mistake", category: "Others" });
});
