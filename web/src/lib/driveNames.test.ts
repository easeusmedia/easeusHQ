import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFolder, normalizeFolderName } from "./driveNames.ts";

// the real contents of Creative Exports, which is what this has to survive
const EXISTING = [
  "Rakuten", "Courageous Leaders", "Dr Ifeoma", "MenoPositive", "HUMAIN",
  "Broker Brunch", "Robyn", "Dr Yusra", "Strategy Real Time", "Jess X Easeus",
  "Dr. Tego", "Elle Sera",
].map((name) => ({ name }));
const found = (wanted: string) => matchFolder(wanted, EXISTING)?.name ?? null;

test("a client lands in the folder they already have, however it's spelled", () => {
  assert.equal(found("The Broker Brunch"), "Broker Brunch"); // a leading "The" doesn't count
  assert.equal(found("Dr Tego"), "Dr. Tego"); // nor does punctuation
  assert.equal(found("Elle Sera"), "Elle Sera");
  assert.equal(found("HUMAIN"), "HUMAIN");
  assert.equal(found("humain"), "HUMAIN"); // nor case
  assert.equal(found("Courageous  Leaders"), "Courageous Leaders"); // nor a double space
});

test("a client with no folder yet gets none — the caller makes one", () => {
  assert.equal(found("Neelkamal TMT"), null);
  assert.equal(found(""), null);
  assert.equal(found("   "), null);
});

test("it never settles for a folder that merely looks similar", () => {
  // the failure that matters: a near-miss quietly filing deliveries into
  // another client's folder
  assert.equal(matchFolder("Elle Sera Ad", EXISTING), null);
  assert.equal(matchFolder("Elle", EXISTING), null);
  assert.equal(matchFolder("Dr", EXISTING), null);
  assert.equal(matchFolder("Robyn Celebrity Reels", EXISTING), null);
});

test("project folders match the same way", () => {
  const projects = [{ name: "26th June - 30 July" }, { name: "Aug" }, { name: "Celebrity Reels" }];
  assert.equal(matchFolder("26th June - 30 July", projects)?.name, "26th June - 30 July");
  assert.equal(matchFolder("26th June – 30 July", projects)?.name, "26th June - 30 July"); // en dash
  assert.equal(matchFolder("Celebrity reels", projects)?.name, "Celebrity Reels");
  assert.equal(matchFolder("1 August - 13 Sept 2026", projects), null); // not "Aug"
});

test("normalizing is stable for names that are already plain", () => {
  assert.equal(normalizeFolderName("Robyn"), "robyn");
  assert.equal(normalizeFolderName("  Dr.  Tego "), "dr tego");
});
