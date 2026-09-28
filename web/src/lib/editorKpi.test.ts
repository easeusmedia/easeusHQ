import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TARGETS, draftHours, editorKpis, meets, settle, shiftMonth, type KpiTask } from "./editorKpi.ts";

const at = (s: string) => new Date(`2026-09-${s}Z`);
const mv = (when: string, from: string, to: string) => ({ at: at(when), from, to });
const task = (over: Partial<KpiTask>): KpiTask => ({
  title: "Video",
  createdAt: at("01T04:00:00"),
  deliveredAt: at("10T04:00:00"),
  dueDate: null,
  handedOffAt: null,
  tags: [],
  moves: [],
  ...over,
});

test("a stage put straight back cancels out; one left in place stays", () => {
  const moves = [
    mv("12T23:14:02", "sent_for_client_approval", "revision_requested"),
    mv("12T23:14:06", "revision_requested", "sent_for_client_approval"),
    mv("12T23:19:12", "sent_for_client_approval", "final_export_ready"),
    mv("13T10:00:00", "final_export_ready", "revision_requested"),
    mv("13T11:00:00", "revision_requested", "final_export_ready"),
  ];
  assert.deepEqual(
    settle(moves).map((m) => m.to),
    ["final_export_ready", "revision_requested", "final_export_ready"]
  );
});

test("first draft runs from picking it up in the queue to first sending it for review", () => {
  const t = task({
    moves: [
      mv("02T04:00:00", "queued", "editing"),
      mv("03T10:00:00", "editing", "sent_for_approval"),
      mv("04T04:00:00", "revision_requested", "sent_for_approval"),
    ],
  });
  assert.equal(draftHours(t), 30);
  // arrived already past the queue: when the edit began isn't known
  assert.equal(draftHours(task({ moves: [mv("02T04:00:00", "sent_for_approval", "editing"), mv("03T10:00:00", "editing", "sent_for_approval")] })), null);
});

test("a month's numbers: on time by handoff, first time, revisions split by who sent it back", () => {
  const k = editorKpis([
    task({ title: "A", dueDate: at("05T00:00:00"), handedOffAt: at("04T10:00:00"), tags: ["Reel"] }),
    task({
      title: "B",
      dueDate: at("05T00:00:00"),
      handedOffAt: at("07T10:00:00"),
      tags: ["Reel"],
      moves: [mv("03T04:00:00", "sent_for_approval", "revision_requested"), mv("06T04:00:00", "sent_for_client_approval", "revision_requested")],
    }),
    // a slip, put back within seconds: still approved first time
    task({ title: "C", tags: ["Trailer"], moves: [mv("03T04:00:00", "sent_for_approval", "revision_requested"), mv("03T04:00:05", "revision_requested", "sent_for_approval")] }),
  ]);
  assert.equal(k.delivered, 3);
  assert.equal(k.onTimePct, 50); // C had no due date, so isn't scored
  assert.equal(k.firstPassPct, 67);
  assert.equal(k.revisions, 0.7);
  assert.deepEqual([k.internalRevisions, k.clientRevisions], [1, 1]);
  assert.deepEqual(k.byType, [["Reel", 2], ["Trailer", 1]]);
  assert.deepEqual(k.late, ["B"]);
});

test("nothing delivered scores nothing, rather than zero", () => {
  const k = editorKpis([]);
  assert.deepEqual([k.onTimePct, k.firstPassPct, k.revisions, k.draftHours], [null, null, null, null]);
  assert.equal(meets("onTimePct", k.onTimePct, DEFAULT_TARGETS), null);
});

test("revisions and draft time are better lower; the rest higher", () => {
  assert.equal(meets("revisions", 1, DEFAULT_TARGETS), true);
  assert.equal(meets("revisions", 1.5, DEFAULT_TARGETS), false);
  assert.equal(meets("draftHours", 60, DEFAULT_TARGETS), false);
  assert.equal(meets("onTimePct", 90, DEFAULT_TARGETS), true);
  assert.equal(meets("delivered", 19, DEFAULT_TARGETS), false);
});

test("months step across a year end", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
