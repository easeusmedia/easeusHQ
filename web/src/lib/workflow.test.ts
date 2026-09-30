import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_STATUSES, availableStatuses, canTransition, nextStatuses } from "./workflow.ts";
import { stageLabel } from "./stages.ts";

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

test("availableStatuses: ops can jump anywhere except where it already is", () => {
  const out = availableStatuses("editing", { role: "core", isAssignee: false });
  assert.equal(out.includes("editing"), false);
  assert.equal(out.includes("queued"), true);
  assert.equal(out.includes("delivered_and_uploaded"), true);
  assert.equal(out.length, ALL_STATUSES.length - 1);
});

test("availableStatuses: an editor only gets moves the workflow actually allows", () => {
  // from "editing" an editor can submit it, or put it back in the queue
  const mine = availableStatuses("editing", { role: "employee", isAssignee: true });
  assert.deepEqual(mine, ["sent_for_approval", "queued"]);

  // but revision_requested is ops' QC verdict, never on offer to an editor
  assert.equal(
    availableStatuses("sent_for_approval", { role: "employee", isAssignee: true }).includes("revision_requested"),
    false
  );

  // someone else's task offers nothing at all
  assert.deepEqual(availableStatuses("editing", { role: "employee", isAssignee: false }), []);
});

test("a design moves through its own five stages, and a to-do through two", () => {
  const founder = { role: "admin" as const, isAssignee: false };
  assert.deepEqual(availableStatuses("sent_for_approval", founder, "design"), ["queued", "editing", "revision_requested", "delivered_and_uploaded"]);
  assert.equal(canTransition("sent_for_approval", "sent_for_client_approval", founder, "design"), false);
  // the designer's own steps are an editor's
  assert.deepEqual(availableStatuses("editing", { role: "employee", isAssignee: true }, "design"), ["sent_for_approval", "queued"]);
  // whoever a to-do is on ticks it off, or reopens it
  assert.deepEqual(availableStatuses("queued", { role: "employee", isAssignee: true }, "todo"), ["delivered_and_uploaded"]);
  assert.deepEqual(availableStatuses("queued", { role: "employee", isAssignee: false }, "todo"), []);
  assert.equal(stageLabel("editing", "design"), "In progress");
  assert.equal(stageLabel("delivered_and_uploaded", "design"), "Final export ready");
  assert.equal(stageLabel("queued", "todo"), "To do");
  assert.equal(stageLabel("editing", "video"), "Editing");
});
