import { test } from "node:test";
import assert from "node:assert/strict";
import { categorise, STARTING_KEYWORDS } from "./categorise.ts";
import { DEFAULT_SCORING } from "./editorKpi.ts";

const CATS = Object.entries(STARTING_KEYWORDS).map(([name, keywords]) => ({ name, keywords }));
const sort = (text: string, fromClient = false) => categorise(text, CATS, fromClient, DEFAULT_SCORING.creativeWords);

test("a comment goes to the category whose keywords it uses", () => {
  assert.deepEqual(sort("There's a typo in the second line"), { kind: "mistake", category: "Typos" });
  assert.deepEqual(sort("Use UK spelling: organisation"), { kind: "mistake", category: "UK/US spelling" });
  // a creative change is never a mistake
  assert.deepEqual(sort("Change the bgm here, it's not the vibe"), { kind: "creative", category: null });
  assert.deepEqual(sort("please add brolls here"), { kind: "creative", category: null });
  // unless a mistake type's words say more
  assert.deepEqual(sort("The bgm audio is too loud"), { kind: "mistake", category: "Sound" });
  assert.deepEqual(sort("The Website is shaking in the beginning?"), { kind: "mistake", category: "Visual glitches" });
  assert.deepEqual(sort("Subtitles are out of sync"), { kind: "mistake", category: "Subtitles" });
});

test("whole words only: 'subs' isn't found inside 'subscribe'", () => {
  assert.notEqual(sort("Add a subscribe button at the end please").category, "Subtitles");
});

test("ours saying 'feedback' is a tip for the future; the client's isn't", () => {
  assert.deepEqual(sort("Feedback: use this kind of hook in future, it keeps them watching"), { kind: "guidance", category: null });
  assert.deepEqual(sort("feedback use this to enhance the visual"), { kind: "guidance", category: null });
  assert.equal(sort("Feedback: the font is too small", true).kind, "mistake");
});

test("praise is praise unless it asks for something; a word or two that matches nothing is a creative change; the rest goes to Others", () => {
  assert.deepEqual(sort("Nice!!!"), { kind: "positive", category: null });
  assert.deepEqual(sort("Great pacing, best one yet"), { kind: "positive", category: null });
  assert.deepEqual(sort("Good, but change the font"), { kind: "mistake", category: "Typography" });
  assert.deepEqual(sort("This transition is not good"), { kind: "mistake", category: "Animation" });
  assert.deepEqual(sort("Because"), { kind: "creative", category: null });
  assert.deepEqual(sort("Can we make this part slightly shorter"), { kind: "mistake", category: "Others" });
});
