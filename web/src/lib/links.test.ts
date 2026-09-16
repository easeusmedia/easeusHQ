import { test } from "node:test";
import assert from "node:assert/strict";
import { linkProblem, pickLink } from "./links.ts";

test("a prompt accepts a bare link, a link without https, and a link inside a sentence", () => {
  assert.equal(pickLink("https://drive.google.com/file/d/x"), "https://drive.google.com/file/d/x");
  assert.equal(pickLink("drive.google.com/file/d/x"), "https://drive.google.com/file/d/x");
  assert.equal(pickLink("final cut: https://f.io/abc thanks"), "https://f.io/abc");
});

test("a prompt refuses text that isn't a link, and says why", () => {
  assert.equal(pickLink("uploaded to drive"), null);
  assert.equal(pickLink("  "), null);
  assert.match(linkProblem("uploaded to drive", "Final Drive link", "https://drive.google.com/…"), /isn't a link/);
  assert.match(linkProblem("", "Final Drive link", "https://drive.google.com/…"), /Add the Final Drive link/);
});
