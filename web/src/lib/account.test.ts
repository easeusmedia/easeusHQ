import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAccount } from "./account.ts";

const me = { email: "riya@easeus.media" };
const input = (over: Partial<Parameters<typeof checkAccount>[0]> = {}) => ({ name: "Riya Kapoor", email: "riya@easeus.media", currentPassword: "", newPassword: "", ...over });

test("a name alone needs no password, and is tidied", () => {
  assert.deepEqual(checkAccount(input({ name: "  Riya   K  " }), me), { name: "Riya K", email: "riya@easeus.media", newPassword: null, needsPassword: false });
  assert.deepEqual(checkAccount(input({ name: " " }), me), { error: "Enter your name." });
});

test("a new email or password asks for the current password", () => {
  assert.ok("error" in checkAccount(input({ email: "new@easeus.media" }), me));
  assert.ok("error" in checkAccount(input({ newPassword: "a-long-enough-one" }), me));
  assert.deepEqual(checkAccount(input({ email: " New@Easeus.Media ", currentPassword: "x" }), me), { name: "Riya Kapoor", email: "new@easeus.media", newPassword: null, needsPassword: true });
});

test("a new password has a minimum length; an email has to look like one", () => {
  assert.ok("error" in checkAccount(input({ newPassword: "short", currentPassword: "x" }), me));
  assert.ok("error" in checkAccount(input({ email: "not-an-email", currentPassword: "x" }), me));
  assert.ok(!("error" in checkAccount(input({ newPassword: "12345678", currentPassword: "x" }), me)));
});
