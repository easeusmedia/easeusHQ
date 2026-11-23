import { test } from "node:test";
import assert from "node:assert/strict";
import { dateChangeAction, movedByHand, parseDateChange, parseStageChange, stageChangeAction } from "./stages.ts";

test("a stage change survives a round trip, with or without Notion's mark", () => {
  assert.equal(stageChangeAction("queued", "editing"), "queued → editing");
  assert.equal(stageChangeAction("queued", "editing", true), "queued → editing (from Notion)");
  assert.deepEqual(parseStageChange("queued → editing"), { from: "queued", to: "editing", fromNotion: false });
  assert.deepEqual(parseStageChange(stageChangeAction("editing", "sent_for_approval", true)), {
    from: "editing",
    to: "sent_for_approval",
    fromNotion: true,
  });
});

test("anything that isn't a stage change parses as nothing", () => {
  // "created", "deleted", a note — the log holds those too, and reading one
  // as a stage change is what put a blank dot on the board's timeline
  for (const action of ["created", "deleted", "", "→", "note added"]) {
    assert.equal(parseStageChange(action), null);
  }
});

test("only the team's own moves make the board the owner of a stage", () => {
  // the point of the mark: a sync copying Notion's column is not a decision,
  // so it must not stop the next sync from correcting the task
  assert.equal(movedByHand([stageChangeAction("queued", "editing", true)]), false);
  assert.equal(movedByHand(["created", stageChangeAction("queued", "editing", true)]), false);
  assert.equal(movedByHand([]), false);
  // one real move, and this board owns the stage from then on
  assert.equal(movedByHand([stageChangeAction("queued", "editing")]), true);
  assert.equal(
    movedByHand([stageChangeAction("queued", "editing", true), stageChangeAction("editing", "sent_for_approval")]),
    true
  );
});

test("a date change survives a round trip and is never read as a stage move", () => {
  const moved = dateChangeAction("draft", "2026-11-04", "2026-11-06");
  assert.deepEqual(parseDateChange(moved), { kind: "draft", from: "2026-11-04", to: "2026-11-06" });
  assert.deepEqual(parseDateChange(dateChangeAction("delivery", null, "2026-11-12")), { kind: "delivery", from: null, to: "2026-11-12" });
  assert.deepEqual(parseDateChange(dateChangeAction("delivery", "2026-11-12", null)), { kind: "delivery", from: "2026-11-12", to: null });
  assert.equal(parseStageChange(moved), null);
  assert.equal(parseDateChange("editing → sent_for_approval"), null);
});
