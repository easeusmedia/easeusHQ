import { test } from "node:test";
import assert from "node:assert/strict";
import { isAbhishekOrAdmin } from "./actingUser.ts";

// tests run in developer mode, as localhost does; the live build has none
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

test("on the live build the developer is a plain Level 2", async () => {
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  env.NODE_ENV = "production";
  const fresh = "./scope.ts?live"; // a second copy, read under the live setting
  const live: typeof import("./scope.ts") = await import(fresh);
  env.NODE_ENV = before;
  assert.equal(live.isFounder({ role: "core", email: "abhishek@easeus.media" }), false);
  assert.equal(live.isFounder({ role: "admin", email: "ashmit@easeus.media" }), true);
});
