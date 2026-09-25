import { test } from "node:test";
import assert from "node:assert/strict";
import { isAbhishekOrAdmin, resolveActingUser } from "./actingUser.ts";

// "?as=" is a real privilege: the page it renders is that person's view of
// the work. Everything below is about who may use it, because a URL is the
// easiest thing in the world for a team member to try changing.
const USERS = [
  { id: "u-ashmit", role: "admin", email: "ashmit@easeus.media" },
  { id: "u-abhishek", role: "core", email: "abhishek@easeus.media" },
  { id: "u-jyotsna", role: "core", email: "jyotsna@easeus.media" },
  { id: "u-sparsh", role: "employee", email: "sparsh@easeus.media" },
];
const acting = (sessionUserId: string, as?: string) => resolveActingUser(USERS, sessionUserId, as)?.id;

test("only the admin and Abhishek can view as someone else", () => {
  assert.equal(acting("u-ashmit", "u-sparsh"), "u-sparsh");
  assert.equal(acting("u-abhishek", "u-sparsh"), "u-sparsh");
});

test("everyone else stays themselves however the URL is edited", () => {
  // another core member is not an admin — Jyotsna cannot read Sparsh's view
  assert.equal(acting("u-jyotsna", "u-sparsh"), "u-jyotsna");
  assert.equal(acting("u-jyotsna", "u-ashmit"), "u-jyotsna");
  // an editor least of all, including trying to become the admin
  assert.equal(acting("u-sparsh", "u-ashmit"), "u-sparsh");
  assert.equal(acting("u-sparsh", "u-jyotsna"), "u-sparsh");
});

test("a nonsense or absent ?as= falls back to the signed-in person", () => {
  assert.equal(acting("u-ashmit"), "u-ashmit");
  assert.equal(acting("u-ashmit", ""), "u-ashmit");
  assert.equal(acting("u-ashmit", "u-does-not-exist"), "u-ashmit");
  assert.equal(acting("u-sparsh", ""), "u-sparsh");
});

test("no session, no acting user — never a default person", () => {
  assert.equal(acting("u-not-a-user"), undefined);
  assert.equal(acting("", "u-ashmit"), undefined);
});

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
