import { test } from "node:test";
import assert from "node:assert/strict";
import { pickList } from "./pickList.ts";

const NEW = { value: "new", label: "＋ New project", pinned: true };
// newest first, the way the pages hand them over
const projects = ["Career Panel", "5 Bad Leadership Behaviours", "Ellie Norman", "Room 101", "Executive Team", "Rory Sutherland"].map(
  (label, i) => ({ value: `p${i}`, label })
);
const labels = (r: ReturnType<typeof pickList>) => r.shown.map((o) => o.label);

test("a long list shows the newest three and the way to make one", () => {
  const r = pickList([NEW, ...projects], "", { recent: 3 }, "");
  assert.deepEqual(labels(r), ["＋ New project", "Career Panel", "5 Bad Leadership Behaviours", "Ellie Norman"]);
  assert.equal(r.older, 3);
  assert.equal(r.searching, true);
});

test("typing reaches every project, and New stays", () => {
  const r = pickList([NEW, ...projects], "", { recent: 3 }, "rory");
  assert.deepEqual(labels(r), ["＋ New project", "Rory Sutherland"]);
  assert.equal(r.older, 0);
  // case and surrounding space don't matter
  assert.deepEqual(labels(pickList([NEW, ...projects], "", { recent: 3 }, "  ROOM ")), ["＋ New project", "Room 101"]);
  // nothing matching leaves only the pinned entry
  assert.deepEqual(labels(pickList([NEW, ...projects], "", { recent: 3 }, "zzz")), ["＋ New project"]);
});

test("an older project that's already picked stays in the list", () => {
  const r = pickList([NEW, ...projects], "p5", { recent: 3 }, "");
  assert.deepEqual(labels(r).slice(-1), ["Rory Sutherland"]);
  assert.equal(r.older, 2);
});

test("a short list is just the list — no search, nothing hidden", () => {
  const few = projects.slice(0, 3);
  const r = pickList([NEW, ...few], "", { recent: 3 }, "");
  assert.equal(r.searching, false);
  assert.equal(r.older, 0);
  assert.equal(r.shown.length, 4);
  // and without a search setting at all, everything shows
  assert.equal(pickList(projects, "", undefined, "").shown.length, 6);
});

test("Show more reveals the next ones, until there are none left", () => {
  const r = pickList([NEW, ...projects], "", { recent: 3 }, "", 2);
  assert.deepEqual(labels(r).slice(1), ["Career Panel", "5 Bad Leadership Behaviours", "Ellie Norman", "Room 101", "Executive Team"]);
  assert.equal(r.older, 1);
  // asking for more than exist just shows them all
  assert.equal(pickList([NEW, ...projects], "", { recent: 3 }, "", 10).older, 0);
});

test("always: a short list still gets its search box", () => {
  const opts = [{ value: "a", label: "Podcast" }];
  assert.equal(pickList(opts, "", { recent: 8 }, "", 0).searching, false);
  assert.equal(pickList(opts, "", { recent: 8, always: true }, "", 0).searching, true);
});
