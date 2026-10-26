import { test } from "node:test";
import assert from "node:assert/strict";
import { extraName, kindOf, numberOf, pickSlot, typesOf, type Slot } from "./deliverableMatch.ts";

const slot = (id: string, name: string, contentType: string, due: string, extra: Partial<Slot> = {}): Slot => ({ id, name, contentType, due, sortOrder: 0, taskId: null, link: null, ...extra });
// Jan Birley, as the blueprint made it
const jan = [
  slot("t", "Jan Birley Trailer", "Reel Trailer", "2026-10-16"),
  slot("l", "Jan Birley Long-form", "YouTube Long-Form", "2026-10-17"),
  slot("th", "Jan Birley Thumbnail", "Thumbnails", "2026-10-17"),
  slot("r1", "Jan Birley Reel 1", "Reel", "2026-10-17"),
  slot("r2", "Jan Birley Reel 2", "Reel", "2026-10-17"),
  slot("r3", "Jan Birley Reel 3", "Reel", "2026-10-18"),
];

test("a task's kind comes from its tags, else its title", () => {
  assert.deepEqual(typesOf(["Reel"], "anything"), ["Reel"]);
  assert.deepEqual(typesOf(["Reel"], "Bonus Reel 1 · Jan Birley"), ["Bonus Reel"]);
  // other kinds of work never fill a placeholder, whatever the title says
  assert.deepEqual(typesOf(["Reel curation"], "Curate reels for Jan"), []);
  assert.deepEqual(typesOf(["Trailer"], "x"), ["Reel Trailer"]);
  assert.deepEqual(typesOf(["Thumbnail"], "Elle Sra Thumbnail Design"), ["Thumbnails"]);
  assert.deepEqual(typesOf(["Podcast editing"], "Episode"), ["YouTube Long-Form"]);
  assert.deepEqual(typesOf(["Audio engineering"], "x"), ["Audio"]);
  assert.deepEqual(typesOf([], "YouTube Long-Form · Jan Birley"), ["YouTube Long-Form"]);
  assert.deepEqual(typesOf([], "Elle Sera x Melissa Levison Trailer"), ["Reel Trailer"]);
  assert.deepEqual(typesOf(["Colour correction"], "Grade the episode"), []);
  assert.deepEqual(typesOf([], "Record Loom"), []);
});

test("the number in a name", () => {
  assert.equal(numberOf("Elle Sera Reel 3"), 3);
  assert.equal(numberOf("Reel 3 · Jan Birley"), 3);
  assert.equal(numberOf("Jan Birley Reel 12"), 12);
  assert.equal(numberOf("Jan Birley Trailer"), null);
  assert.equal(numberOf("Pip Jamieson 2 Trailer"), null);
});

test("a task takes the free placeholder with its number, else the one due first", () => {
  assert.equal(pickSlot({ id: "a", title: "Elle Sera Reel 2", types: ["Reel", "Bonus Reel"] }, jan)?.id, "r2");
  assert.equal(pickSlot({ id: "a", title: "Reel edit", types: ["Reel"] }, jan)?.id, "r1");
  assert.equal(pickSlot({ id: "a", title: "Trailer v2", types: ["Reel Trailer"] }, jan)?.id, "t");
  // taken, or filled in by hand: not free
  const taken = jan.map((s) => (s.id === "r2" ? { ...s, taskId: "other" } : s.id === "r1" ? { ...s, link: "https://drive" } : s));
  assert.equal(pickSlot({ id: "a", title: "Elle Sera Reel 2", types: ["Reel"] }, taken)?.id, "r3");
  // one it already holds stays its own, while it's that kind
  const mine = jan.map((s) => (s.id === "r3" ? { ...s, taskId: "a", link: "https://drive" } : s));
  assert.equal(pickSlot({ id: "a", title: "Elle Sera Reel 1", types: ["Reel"] }, mine)?.id, "r3");
  assert.equal(pickSlot({ id: "a", title: "Now a trailer", types: ["Reel Trailer"] }, mine)?.id, "t");
  // nothing of its kind left
  assert.equal(pickSlot({ id: "a", title: "Audio", types: ["Audio"] }, jan), null);
});

test("an extra placeholder is numbered after the ones there", () => {
  assert.equal(extraName("Jan Birley", "Reel", jan), "Jan Birley Reel 4");
  assert.equal(extraName("Jan Birley", "Audio", jan), "Jan Birley Audio");
  assert.equal(extraName("Jan Birley", "Thumbnails", jan), "Jan Birley Thumbnail 2");
});

test("Notion's spellings of a placeholder's kind still match", () => {
  assert.equal(kindOf("Reels"), "Reel");
  assert.equal(kindOf("TRAILER"), "Reel Trailer");
  assert.equal(kindOf("Long form"), "YouTube Long-Form");
  assert.equal(kindOf("Bonus reels"), "Bonus Reel");
  assert.equal(kindOf("Misc."), null);
  const old = [slot("x", "Jan Reels 1", "Reels", "2026-10-17")];
  assert.equal(pickSlot({ id: "a", title: "Reel 1", types: ["Reel"] }, old)?.id, "x");
});

test("a placeholder filled by hand with the task's own link is still its", () => {
  const filled = [slot("r1", "Jan Birley Reel 1", "Reel", "2026-10-17", { link: "https://drive/a" })];
  assert.equal(pickSlot({ id: "a", title: "Reel 1", types: ["Reel"], driveLink: "https://drive/a" }, filled)?.id, "r1");
  assert.equal(pickSlot({ id: "a", title: "Reel 1", types: ["Reel"], driveLink: "https://drive/b" }, filled), null);
});

test("the placeholder already holding its file comes before its number", () => {
  const pasted = [slot("r1", "Jan Birley Reel 1", "Reel", "2026-10-17"), slot("r4", "Jan Birley Reel 4", "Reel", "2026-10-18", { link: "https://drive/x" })];
  assert.equal(pickSlot({ id: "a", title: "Elle Sera Reel 1", types: ["Reel"], driveLink: "https://drive/x" }, pasted)?.id, "r4");
});

test("untagged work around a deliverable fills no placeholder, whatever its name says", () => {
  assert.deepEqual(typesOf([], "Reel Cover For Pip Episode"), []);
  assert.deepEqual(typesOf([], "Amends to be done (Reels)/CL"), []);
  assert.deepEqual(typesOf([], "CL Trailer Rectification"), []);
  assert.deepEqual(typesOf([], "Posting (Instagram) reels"), []);
  assert.deepEqual(typesOf([], "Schedule the reels"), []);
  assert.deepEqual(typesOf([], "Reel captions for Kelly"), []);
  // the deliverable itself still does
  assert.deepEqual(typesOf([], "Kindness reel"), ["Reel"]);
  assert.deepEqual(typesOf([], "Pip Jamieson Trailer"), ["Reel Trailer"]);
  // a type given by hand always wins over the name
  assert.deepEqual(typesOf(["Reel"], "Reel cover"), ["Reel"]);
});
