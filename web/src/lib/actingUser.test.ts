import { test } from "node:test";
import assert from "node:assert/strict";
import { isAbhishekOrAdmin } from "./actingUser.ts";

test("the admin check is role or that one address, nothing looser", () => {
  assert.equal(isAbhishekOrAdmin({ role: "admin", email: "anyone@example.com" }), true);
  assert.equal(isAbhishekOrAdmin({ role: "core", email: "abhishek@easeus.media" }), true);
  assert.equal(isAbhishekOrAdmin({ role: "core", email: "jyotsna@easeus.media" }), false);
  assert.equal(isAbhishekOrAdmin({ role: "employee", email: "sparsh@easeus.media" }), false);
  // not a lookalike address, and not a prefix of it
  assert.equal(isAbhishekOrAdmin({ role: "employee", email: "abhishek@easeus.media.evil.com" }), false);
  assert.equal(isAbhishekOrAdmin({ role: "employee", email: "abhishek@easeus.medi" }), false);
  assert.equal(isAbhishekOrAdmin({ role: "employee", email: "" }), false);
});
