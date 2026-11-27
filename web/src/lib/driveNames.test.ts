import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryFileName, isTypeFolder, matchFolder, normalizeFolderName, projectFolderScore, typeFolder } from "./driveNames.ts";

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

test("a project's folder is found by its words, wherever the client keeps it", () => {
  assert.equal(projectFolderScore("Liberty Mills", "28. Liberty Mills "), 3);
  assert.equal(projectFolderScore("Room 101", "Room 101"), 3);
  assert.equal(projectFolderScore("Charlotte Pearce", "Charlotte Pearce  (Podcast 3)"), 3);
  assert.equal(projectFolderScore("[Home] Reel 116 - Skin Treatments That Transformed My Skin", "Reel 116 - Skin Treatments That Transformed My Skin"), 3);
  assert.equal(projectFolderScore("Sergio Lopez", "Sergio Lopez Solo"), 3); // "solo" is set aside
  assert.equal(projectFolderScore("It's Okay To Upset People", "Jo solo - It's Okay to Upset People"), 3);
  assert.equal(projectFolderScore("Podcast 28 Elle Sera X Paige Chohan", "1. Paige Chohan"), 2);
  assert.equal(projectFolderScore("Katie Jackson", "Katie "), 1);
});

test("a project's folder is never one that only looks alike", () => {
  assert.equal(projectFolderScore("Podcast 1", "Podcast 10 (Leanne)"), 0);
  assert.equal(projectFolderScore("Video 1", "Video 2"), 0);
  assert.equal(projectFolderScore("Celebrity Reels", "Reels"), 0);
  assert.equal(projectFolderScore("Leadership Room 101", "Room 101"), 2); // its words are all there: the closest there is
  assert.equal(projectFolderScore("Melissa Levison", "29. Charlie Thomas"), 0);
  assert.equal(projectFolderScore("Reel 115 - Skin Barrier", "2025"), 0);
});

test("each kind of work goes in its own folder in the project", () => {
  const cl = ["Thumbnails", "Audio", "Full Length", "Trailer", "YT Copy", "Reels"].map((name) => ({ name }));
  const at = (type: string | null, list = cl) => {
    const r = typeFolder(type, list);
    return r === null ? null : "found" in r ? r.found.name : `make ${r.make}`;
  };
  assert.equal(at("Reel"), "Reels");
  assert.equal(at("Reel Trailer"), "Trailer");
  assert.equal(at("YouTube Long-Form"), "Full Length");
  assert.equal(at("Thumbnails"), "Thumbnails");
  assert.equal(at("Audio"), "Audio");
  assert.equal(at("Bonus Reel"), "make Bonus Reel");
  assert.equal(at("YouTube Long-Form", [{ name: "Full Length Epidose" }]), "Full Length Epidose");
  assert.equal(at("Reel", [{ name: "Instagram Reels " }, { name: "Youtube Reels" }]), "Instagram Reels ");
  assert.equal(at("Reel", []), "make Reels");
  // a reel's thumbnail folder is never its reels' folder (Dr Tego's "Reel 37 - Thumbnail")
  assert.equal(at("Reel", [{ name: "Reel 37 - Thumbnail" }]), "make Reels");
  assert.equal(at("Thumbnails", [{ name: "Reel 37 - Thumbnail" }]), "Reel 37 - Thumbnail");
  assert.equal(at("Reel", [{ name: "Reels W/ Cover" }]), "Reels W/ Cover");
  assert.equal(at("Reel Trailer", [{ name: "Trailer (Reel Format)" }]), "Trailer (Reel Format)");
  assert.equal(at(null), null);
  assert.equal(isTypeFolder("Reels"), true);
  assert.equal(isTypeFolder("Liberty Mills"), false);
});

test("a delivered file is named for the piece it is: Reel 6 - Libido.mp4", () => {
  const name = (title: string, originalTitle: string | null, type: string | null, extra: Partial<{ client: string; project: string; fileName: string }> = {}, taken: string[] = []) =>
    deliveryFileName({ type, title, originalTitle, client: "Courageous Leaders", project: "Angela Duckworth", fileName: "export.mp4", ...extra }, taken);
  assert.equal(name("Liberty Mills Reel 6 [Libido]", "Liberty Mills Reel 7 [Libido]", "Reel", { client: "Elle Sera", project: "Liberty Mills", fileName: "Reel-2[Libido].mp4" }), "Reel 6 - Libido.mp4");
  assert.equal(name("Angela Duckworth Reel 4", "Burnout", "Reel"), "Reel 4 - Burnout.mp4");
  assert.equal(name("Angela Duckworth Reel 1", "CL - Mentors", "Reel"), "Reel 1 - Mentors.mp4");
  assert.equal(name("Angela Duckworth Reel 2", "CL - Nobody does anything alone", "Reel"), "Reel 2 - Nobody does anything alone.mp4");
  assert.equal(name("Sarah Jayne Dunn Reel 2", null, "Reel", { client: "Elle Sera", project: "Sarah Jayne Dunn" }), "Reel 2.mp4");
  assert.equal(name("Sarah Jayne Dunn Reel 1", "Reel 1 (25 Vs Now)", "Reel", { client: "Elle Sera", project: "Sarah Jayne Dunn" }), "Reel 1 - 25 Vs Now.mp4");
  assert.equal(name("Reel 115 - Skin Barrier", "Dr Tego Reel-1", "Reel", { client: "Dr Tego", project: "Reel 115 - Skin Barrier" }), "Reel 115 - Skin Barrier.mp4");
  assert.equal(name("[Home] Reel 116 - Skin Treatments That Transformed My Skin", null, "Reel", { client: "Dr Tego", project: "[Home] Reel 116 - Skin Treatments That Transformed My Skin" }), "Reel 116 - Skin Treatments That Transformed My Skin.mp4");
  assert.equal(name("Reel 117 - CO2 Laser", "Dr Tego -2", "Reel", { client: "Dr Tego", project: "Reel 117 - CO2 Laser" }), "Reel 117 - CO2 Laser.mp4");
  assert.equal(name("Sarah Jayne Dunn Trailer", "Sarah Jayne Dunn Trailer Edit", "Reel Trailer", { client: "Elle Sera", project: "Sarah Jayne Dunn" }), "Trailer.mp4");
  assert.equal(name("Joanna's Solo (End of Year) Long-form", "Jo Solo Edit", "YouTube Long-Form", { project: "Joanna's Solo (End of Year)" }), "Full Length.mp4");
  assert.equal(name("Sarah Jayne Dunn Thumbnail", "Elle Sera Thumbnail Edit", "Thumbnails", { client: "Elle Sera", project: "Sarah Jayne Dunn", fileName: "thumb.PNG" }), "Thumbnail 1.png");
  assert.equal(name("Angela Duckworth Reel 4", "Burnout", "Reel", {}, ["Reel 4 - Burnout.mp4"]), "Reel 4 - Burnout v2.mp4");
  assert.equal(name("Angela Duckworth Reel 4", "Burnout", "Reel", {}, ["reel 4 - burnout.mp4", "Reel 4 - Burnout v2.mp4"]), "Reel 4 - Burnout v3.mp4");
  assert.equal(name("Leadership Room 101 Trailer", "CL Trailer Edit [Room 101]", "Reel Trailer", { project: "Leadership Room 101" }), "Trailer.mp4");
  // test thumbnails go in 1, 2, 3; a reel with no number takes the next free one
  assert.equal(name("Sarah Jayne Dunn Thumbnail", null, "Thumbnails", { fileName: "b.png" }, ["Thumbnail 1.png"]), "Thumbnail 2.png");
  assert.equal(name("Sarah Jayne Dunn Thumbnail", null, "Thumbnails", { fileName: "c.jpg" }, ["Thumbnail 1.png", "Thumbnail 2.png"]), "Thumbnail 3.jpg");
  assert.equal(name("Elle Sera Reel", null, "Reel", { client: "Elle Sera", project: "Short-form (Extra Reels)" }, ["Reel 1.mp4", "Reel 2 - Glow.mp4"]), "Reel 3.mp4");
  // the file's own name gives the topic when nothing else does
  assert.equal(name("Sarah Jayne Dunn Reel 3", null, "Reel", { client: "Elle Sera", project: "Sarah Jayne Dunn", fileName: "Reel-3 [Morning Routine].mp4" }), "Reel 3 - Morning Routine.mp4");
  assert.equal(name("Reel 115 - Skin Barrier", null, "Reel", { client: "Dr Tego", project: "Reel 115 - Skin Barrier", fileName: "Dr Tego Reel-1.mp4" }), "Reel 115 - Skin Barrier.mp4");
  assert.equal(name("Sarah Jayne Dunn Reel 2", null, "Reel", { client: "Elle Sera", project: "Sarah Jayne Dunn", fileName: "Sarah Jayne Dunn Reel 2 Final.mp4" }), "Reel 2.mp4");
  assert.equal(name("Some task", null, null), null);
});
