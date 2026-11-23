import { test } from "node:test";
import assert from "node:assert/strict";
import { clientHref, firstFree, projectSlugs, slugify } from "./slug.ts";

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

test("a shared project's address is its name, the older of two alike keeping it plain", () => {
  const s = projectSlugs([
    { id: "b", name: "Matt Porter", type: "podcast", createdAt: new Date("2026-11-02") },
    { id: "a", name: "Matt Porter", type: "podcast", createdAt: new Date("2026-11-01") },
    { id: "c", name: null, type: "reels", createdAt: new Date("2026-11-03") },
  ]);
  assert.equal(s.get("a"), "matt-porter");
  assert.equal(s.get("b"), "matt-porter-2");
  assert.equal(s.get("c"), "reels");
});

test("a client's page is at its address", () => {
  assert.equal(clientHref({ slug: "elle-sera" }), "/clients/elle-sera");
});
