import { test } from "node:test";
import assert from "node:assert/strict";
import { sign, unsign } from "./sessionToken.ts";

test("only a cookie this app signed counts as signed in", () => {
  const token = sign("user-1");
  assert.equal(unsign(token), "user-1");
  assert.equal(unsign(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")), null); // tampered
  assert.equal(unsign(`user-2.${token.split(".")[1]}`), null); // someone else's id, same signature
  assert.equal(unsign("user-1"), null);
  assert.equal(unsign("fake.forged"), null);
});
