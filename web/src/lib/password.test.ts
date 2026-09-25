import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.ts";
import { PUBLIC_USER_SELECT } from "./publicUser.ts";

test("a password verifies against its own hash and nothing else", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("Correct horse battery staple", stored), false);
  assert.equal(verifyPassword("correct horse battery stapl", stored), false);
  assert.equal(verifyPassword("", stored), false);
});

test("the same password hashes differently every time", () => {
  // salted: two people who pick the same password must not be visibly
  // identical in the table
  assert.notEqual(hashPassword("hunter2"), hashPassword("hunter2"));
  assert.match(hashPassword("hunter2"), /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test("a malformed stored value is refused, not crashed on", () => {
  for (const stored of ["", ":", "nosalt", "salt:", ":hash", "salt:nothex", "a:b:c"]) {
    assert.equal(verifyPassword("anything", stored), false, `stored=${JSON.stringify(stored)}`);
  }
});

test("the user fields that reach the browser never include a secret", () => {
  // this select exists because `include: { assignedTo: true }` was shipping
  // passwordHash into the page; keep it to a name and an id
  assert.deepEqual(Object.keys(PUBLIC_USER_SELECT).sort(), ["id", "name"]);
  for (const field of ["passwordHash", "password", "salary", "email", "phone", "address"]) {
    assert.equal(field in PUBLIC_USER_SELECT, false, `${field} must not be public`);
  }
});
