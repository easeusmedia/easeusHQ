import { test } from "node:test";
import assert from "node:assert/strict";
import { movedByHand, parseStageChange, stageChangeAction } from "./stages.ts";

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
