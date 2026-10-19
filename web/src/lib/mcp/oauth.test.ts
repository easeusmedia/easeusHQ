import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeOf, checkAuthorize, clientTag, redirectAllowed, seal, unseal, type Client } from "./oauth.ts";

test("a sealed value opens only as its own kind, untouched, before it expires", () => {
  const v = seal("code", { u: "me" }, 60);
  assert.equal(unseal<{ u: string }>("code", v)?.u, "me");
  assert.equal(unseal("client", v), null);
  const [body, sig] = v.split(".");
  assert.equal(unseal("code", `${Buffer.from(JSON.stringify({ u: "you", exp: 9e9 })).toString("base64url")}.${sig}`), null);
  assert.equal(unseal("code", `${body}.${sig.replace(/^./, (c) => (c === "a" ? "b" : "a"))}`), null);
  assert.equal(unseal("code", seal("code", { u: "me" }, -1)), null);
  assert.equal(unseal("code", "nonsense"), null);
});

test("PKCE S256 matches RFC 7636's example", () => {
  assert.equal(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("codes go only to Claude or a Claude on this computer", () => {
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("https://claude.com/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://localhost:53123/callback"));
  assert.ok(redirectAllowed("http://127.0.0.1:8080/cb"));
  assert.ok(!redirectAllowed("https://claude.ai.evil.com/cb"));
  assert.ok(!redirectAllowed("http://claude.ai/cb"));
  assert.ok(!redirectAllowed("https://evil.com/cb"));
  assert.ok(!redirectAllowed("https://user:pw@claude.ai/cb"));
  assert.ok(!redirectAllowed("javascript:alert(1)"));
  assert.ok(!redirectAllowed("not a url"));
});

test("the sign-in page takes only a registered client, its address and a S256 challenge", () => {
  const client_id = seal("client", { n: "Claude", r: ["https://claude.ai/api/mcp/auth_callback"] } satisfies Client);
  const ok = { response_type: "code", client_id, code_challenge: "x", code_challenge_method: "S256" };
  const r = checkAuthorize(ok);
  assert.ok(!("error" in r) && r.redirect === "https://claude.ai/api/mcp/auth_callback");
  assert.ok("error" in checkAuthorize({ ...ok, redirect_uri: "https://claude.ai/other" }));
  assert.ok("error" in checkAuthorize({ ...ok, code_challenge_method: "plain" }));
  assert.ok("error" in checkAuthorize({ ...ok, code_challenge: undefined }));
  assert.ok("error" in checkAuthorize({ ...ok, client_id: client_id + "x" }));
  assert.equal(clientTag(client_id), clientTag(client_id));
  assert.notEqual(clientTag(client_id), clientTag(client_id + "x"));
});
