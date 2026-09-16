import { test } from "node:test";
import assert from "node:assert/strict";
import { clientHref, clientLogoSrc, firstFree, slugify } from "./slug.ts";

test("a client's address is its name, plainly", () => {
  assert.equal(slugify("Elle Sera"), "elle-sera");
  assert.equal(slugify("Dr. Tego"), "dr-tego");
  assert.equal(slugify("  The Broker Brunch "), "the-broker-brunch");
  assert.equal(slugify("HUMAIN"), "humain");
  assert.equal(slugify("Café & Co"), "cafe-and-co");
  assert.equal(slugify("!!!"), "client");
});

test("two clients never share an address, and none takes an existing page's", () => {
  assert.equal(firstFree("robyn", new Set()), "robyn");
  assert.equal(firstFree("robyn", new Set(["robyn", "robyn-2"])), "robyn-3");
  assert.equal(firstFree("template", new Set()), "template-2");
});

test("a logo is its own cached address, which changes when the logo does", () => {
  const a = clientLogoSrc({ slug: "elle-sera", avatarUrl: "data:image/jpeg;base64,AAA" });
  const b = clientLogoSrc({ slug: "elle-sera", avatarUrl: "data:image/jpeg;base64,AAB" });
  assert.match(a!, /^\/clients\/elle-sera\/logo\?v=\w+$/);
  assert.notEqual(a, b);
  assert.equal(clientLogoSrc({ slug: "elle-sera", avatarUrl: null }), null);
  assert.equal(clientHref({ slug: "elle-sera" }), "/clients/elle-sera");
});
