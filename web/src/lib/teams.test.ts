import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentFor, displayTeam, slugOf } from "./teams.ts";

const ops = { slug: "operations", name: "Operations" };
const sales = { slug: "sales", name: "Sales" };

test("everyone is shown under their own department", () => {
  assert.equal(displayTeam({ role: "core", team: ops })?.name, "Operations");
  assert.equal(displayTeam({ role: "employee", team: sales })?.name, "Sales");
  assert.equal(displayTeam({ role: "admin", team: null }), null);
});

test("the position decides the department; an admin without one spans the company", () => {
  assert.equal(departmentFor("employee", "ops", "sales"), "ops");
  assert.equal(departmentFor("admin", "ops", null), "ops");
  assert.equal(departmentFor("admin", null, "ops"), null);
  assert.equal(departmentFor("core", null, "sales"), "sales");
  assert.equal(departmentFor("core", undefined, ""), null);
});

test("a department's slug comes from its name", () => {
  assert.equal(slugOf("  Post production "), "post-production");
  assert.equal(slugOf("R&D"), "r-d");
});
