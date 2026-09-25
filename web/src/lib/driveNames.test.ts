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

test("a folder numbered by hand still matches the name underneath", () => {
  const drive = [{ name: "1. Reels" }, { name: "02 - Trailer" }, { name: "3) Podcast" }, { name: "04: Ads" }];
  assert.equal(matchFolder("Reels", drive)?.name, "1. Reels");
  assert.equal(matchFolder("Trailer", drive)?.name, "02 - Trailer");
  assert.equal(matchFolder("podcast", drive)?.name, "3) Podcast");
  assert.equal(matchFolder("ADS", drive)?.name, "04: Ads");
  // and the other way round: ours numbered, theirs plain
  assert.equal(matchFolder("1. Reels", [{ name: "Reels" }])?.name, "Reels");
});

test("a number that IS the name is left alone", () => {
  // the danger of stripping digits blindly: every year folder would
  // normalize to nothing and then match every other one
  const years = [{ name: "2025" }, { name: "2026" }];
  assert.equal(matchFolder("2026", years)?.name, "2026");
  assert.equal(matchFolder("2025", years)?.name, "2025");
  assert.equal(matchFolder("2024", years), null);
  // a date range keeps its leading day
  const ranges = [{ name: "1 August - 13 Sept" }, { name: "26th June - 30 July" }];
  assert.equal(matchFolder("1 August - 13 Sept", ranges)?.name, "1 August - 13 Sept");
  assert.equal(matchFolder("13 August - 1 Sept", ranges), null);
});

test("case, spacing, ampersands and stray punctuation are all ignored", () => {
  const drive = [{ name: "SHORT-FORM" }, { name: "Herbs & Greens" }, { name: "  Monthly   Report " }];
  assert.equal(matchFolder("Short-form", drive)?.name, "SHORT-FORM");
  assert.equal(matchFolder("short form", drive)?.name, "SHORT-FORM");
  assert.equal(matchFolder("Herbs and Greens", drive)?.name, "Herbs & Greens");
  assert.equal(matchFolder("monthly report", drive)?.name, "  Monthly   Report ");
});

test("the same date written two ways is the same folder", () => {
  // these are real: "2nd May - 25 June" in Drive, "2nd May - 25th June" here
  const drive = [{ name: "2nd May - 25 June" }, { name: "31st March- 1st May" }];
  assert.equal(matchFolder("2nd May - 25th June", drive)?.name, "2nd May - 25 June");
  assert.equal(matchFolder("2 May - 25 June", drive)?.name, "2nd May - 25 June");
  assert.equal(matchFolder("31st March-1st May", drive)?.name, "31st March- 1st May");
  // still not a different date
  assert.equal(matchFolder("2nd May - 26th June", drive), null);
});
