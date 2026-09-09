import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextStatuses } from "./workflow.ts";

test("the assigned editor can carry their own task through their 3 stages", () => {
  const assignee = { role: "employee" as const, isAssignee: true };
  assert.equal(canTransition("queued", "editing", assignee), true);
  assert.equal(canTransition("editing", "sent_for_approval", assignee), true);
  assert.equal(canTransition("revision_requested", "editing", assignee), true);
});

test("an editor cannot touch a task assigned to someone else", () => {
  const other = { role: "employee" as const, isAssignee: false };
  assert.equal(canTransition("queued", "editing", other), false);
  assert.equal(canTransition("editing", "sent_for_approval", other), false);
});

test("an editor cannot request a revision, mark final export, or mark delivery — those are ops-only", () => {
  const assignee = { role: "employee" as const, isAssignee: true };
  assert.equal(canTransition("sent_for_approval", "revision_requested", assignee), false);
  assert.equal(canTransition("sent_for_approval", "final_export_ready", assignee), false);
  assert.equal(canTransition("final_export_ready", "delivered_and_uploaded", assignee), false);
});

test("an editor cannot skip stages or go outside the guided workflow", () => {
  const assignee = { role: "employee" as const, isAssignee: true };
  assert.equal(canTransition("queued", "sent_for_approval", assignee), false);
  assert.equal(canTransition("editing", "delivered_and_uploaded", assignee), false);
});

test("ops (admin/core) has full manual control over the queue — no gated graph, no assignment check", () => {
  for (const role of ["admin", "core"] as const) {
    const ops = { role, isAssignee: false };
    assert.equal(canTransition("sent_for_approval", "revision_requested", ops), true);
    assert.equal(canTransition("final_export_ready", "delivered_and_uploaded", ops), true);
    // can fix mistakes by skipping stages or moving a card backwards freely
    assert.equal(canTransition("queued", "sent_for_approval", ops), true);
    assert.equal(canTransition("sent_for_approval", "editing", ops), true);
  }
});

test("delivered_and_uploaded is terminal in the guided graph (no buttons offered for it)", () => {
  assert.deepEqual(nextStatuses("delivered_and_uploaded"), []);
});
