import { test } from "node:test";
import assert from "node:assert/strict";
import { displayTeam } from "./teams.ts";

const ops = { slug: "operations", name: "Operations" };
const sales = { slug: "sales", name: "Sales" };

test("Operations is only its core — editors are shown as Editors, the admin under no team", () => {
  assert.equal(displayTeam({ role: "core", team: ops })?.name, "Operations"); // Arpit, Abhishek, Jyotsna
  assert.equal(displayTeam({ role: "employee", team: ops })?.name, "Editors"); // Sparsh, Narendra
  assert.equal(displayTeam({ role: "admin", team: ops }), null); // Ashmit
});

test("every other team is shown as it is", () => {
  assert.equal(displayTeam({ role: "core", team: sales })?.name, "Sales");
  assert.equal(displayTeam({ role: "employee", team: sales })?.name, "Sales");
  assert.equal(displayTeam({ role: "employee", team: null }), null);
});
