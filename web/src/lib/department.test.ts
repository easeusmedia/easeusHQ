import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentFromTitle, STARTING_WORDS } from "./department.ts";

const depts = Object.entries(STARTING_WORDS).map(([id, keywords]) => ({ id, keywords }));

test("a task goes where the words in its title point", () => {
  assert.equal(departmentFromTitle("Editor Inspection", depts), "production");
  assert.equal(departmentFromTitle("Elle Sera -  Kelly Reel Curate", depts), "production");
  assert.equal(departmentFromTitle("Elle Sera Upload", depts), "distribution");
  assert.equal(departmentFromTitle("Proposal for Skin Co", depts), "sales");
  assert.equal(departmentFromTitle("Script for the GPL episode", depts), "content");
  assert.equal(departmentFromTitle("October invoices", depts), "finance");
  assert.equal(departmentFromTitle("Call with Dr Tego about the plan", depts), "client-services");
});

test("whole words only, and nothing matched is nothing", () => {
  assert.equal(departmentFromTitle("Poster", [{ id: "d", keywords: "post" }]), null);
  assert.equal(departmentFromTitle("Demo", depts), null);
});
