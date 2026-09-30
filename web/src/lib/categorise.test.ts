import { test } from "node:test";
import assert from "node:assert/strict";
import { categorise, STARTING_KEYWORDS } from "./categorise.ts";

const CATS = Object.entries(STARTING_KEYWORDS).map(([name, keywords]) => ({ name, keywords, group: name === "Creative" ? "feedback" : "mistake" }));

test("a comment goes to the category whose keywords it uses", () => {
  assert.deepEqual(categorise("There's a typo in the second line", CATS), { kind: "mistake", category: "Typos" });
  assert.deepEqual(categorise("Use UK spelling: organisation", CATS), { kind: "mistake", category: "UK/US spelling" });
  // Creative is a feedback type: a suggestion, never a mistake
  assert.deepEqual(categorise("Change the bgm here, it's not the vibe", CATS), { kind: "guidance", category: "Creative" });
  assert.deepEqual(categorise("The Website is shaking in the beginning?", CATS), { kind: "mistake", category: "Visual glitches" });
  assert.deepEqual(categorise("Subtitles are out of sync", CATS), { kind: "mistake", category: "Subtitles" });
});

test("whole words only: 'subs' isn't found inside 'subscribe'", () => {
  assert.notEqual(categorise("Add a subscribe button at the end please", CATS).category, "Subtitles");
});

test("ours saying 'feedback' is feedback, never scored; the client's isn't", () => {
  assert.deepEqual(categorise("Feedback: use this kind of hook in future, it keeps them watching", CATS), { kind: "guidance", category: null });
  assert.deepEqual(categorise("feedback use this to enhance the visual", CATS), { kind: "guidance", category: null });
  assert.equal(categorise("Feedback: the font is too small", CATS, true).kind, "mistake");
});

test("praise is praise unless it asks for something; a word or two that matches nothing isn't feedback; the rest goes to Others", () => {
  assert.deepEqual(categorise("Nice!!!", CATS), { kind: "positive", category: null });
  assert.deepEqual(categorise("Great pacing, best one yet", CATS), { kind: "positive", category: null });
  assert.deepEqual(categorise("Good, but change the font", CATS), { kind: "mistake", category: "Typography" });
  assert.deepEqual(categorise("This transition is not good", CATS), { kind: "mistake", category: "Animation" });
  assert.deepEqual(categorise("Because", CATS), { kind: "note", category: null });
  assert.deepEqual(categorise("Can we make this part slightly shorter", CATS), { kind: "mistake", category: "Others" });
});
