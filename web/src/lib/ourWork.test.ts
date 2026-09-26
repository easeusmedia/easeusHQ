import { test } from "node:test";
import assert from "node:assert/strict";
import { counts, matchTask, sameSubject, taskSubject, keywords } from "./ourWork.ts";

const tasks = [
  { title: "Tego - Skin Boosters", from: "2026-09-01", to: "2026-10-30" },
  { title: "Tego - Dark Skin", from: "2026-09-01", to: "2026-10-30" },
  { title: "Tego - Laser For Hyperpigmentation", from: "2026-09-01", to: "2026-10-30" },
  { title: "Elle Sera - Hair Loss", from: "2026-09-01", to: "2026-10-30" },
  { title: "Elle Sera - Expanding Business", from: "2026-09-01", to: "2026-10-30" },
  { title: "CL - Pip Jamieson Trailer", from: "2026-09-01", to: "2026-10-30" },
];
const post = (title: string, published = "2026-09-17") => ({ title, published });

test("a post about what one of our tasks was about is ours", () => {
  assert.equal(matchTask(post("Skin-boosters vs Biostimulators 💉"), tasks), "Tego - Skin Boosters");
  assert.equal(matchTask(post("Are lasers safe for darker skin 👀"), tasks), "Tego - Dark Skin");
  assert.equal(matchTask(post("The Real Cause of Hair Loss"), tasks), "Elle Sera - Hair Loss");
  assert.equal(matchTask(post("How Expanding a Business Changed Everything"), tasks), "Elle Sera - Expanding Business");
  assert.equal(matchTask(post("Pip Jamieson on building The Dots"), tasks), "CL - Pip Jamieson Trailer");
});

test("a client's own post isn't, however near the subject", () => {
  assert.equal(matchTask(post("My £200 skincare regime 📝 where to save and where to splurge."), tasks), null);
  assert.equal(matchTask(post("Treatments to tackle your skin texture 📝"), tasks), null);
  assert.equal(matchTask(post("Madrid diaries 🤍"), tasks), null);
  // one generic word of a two-word subject isn't enough
  assert.equal(matchTask(post("The Hidden Reality Of Running A Business"), tasks), null);
  // the right subject, but long before the task
  assert.equal(matchTask(post("Skin boosters explained", "2026-06-01"), tasks), null);
});

test("the pieces", () => {
  assert.deepEqual(taskSubject("CL - Wrong reasons - Career Panel"), ["wrong", "reasons", "career", "panel"]);
  assert.equal(sameSubject(["wrong", "reasons", "career", "panel"], keywords("Joining for the wrong reasons? A career panel")), true);
  assert.equal(counts(null, true), true);
  assert.equal(counts(null, false), false);
  assert.equal(counts(false, true), false);
  assert.equal(counts(true, false), true);
});
