import { test } from "node:test";
import assert from "node:assert/strict";
import { changedAny, keyOf, plan, type Kept, type Row } from "./undoPlan.ts";

const now = (...rows: Kept[]) => new Map<string, Row>(rows.map((k) => [keyOf(k), k.r]));
const lead = (r: Row, d = 0): Kept => ({ t: "Lead", d, r: { id: "L1", ...r } });
const event = (id: string): Kept => ({ t: "LeadEvent", d: 1, r: { id, leadId: "L1" } });

test("an edit is undone column by column, leaving later changes to other columns", () => {
  const before = [lead({ title: "Old", openers: 0 })];
  const after = [lead({ title: "New", openers: 0 })];
  const p = plan(after, before, now(lead({ title: "New", openers: 3 })));
  assert.equal(p.conflict, undefined);
  assert.deepEqual(p.updates.map((u) => u.cols), [["title"]]);
});

test("a column changed again since stops the undo", () => {
  const p = plan([lead({ title: "New" })], [lead({ title: "Old" })], now(lead({ title: "Newer" })));
  assert.ok(p.conflict);
});

test("only order or timestamps changed: no step", () => {
  assert.equal(changedAny([lead({ sortOrder: 1, updatedAt: "a" })], [lead({ sortOrder: 2, updatedAt: "b" })]), false);
  assert.equal(changedAny([lead({ readAt: null })], [lead({ readAt: "b" })]), false);
  assert.equal(changedAny([lead({ title: "a" })], [lead({ title: "b" })]), true);
});

test("undoing a delete puts the row back before what hangs off it", () => {
  const before = [lead({ title: "X" }), event("E1"), { t: "_LeadTags", d: 1, r: { A: "L1", B: "T1" } }];
  const p = plan([], before, now());
  assert.deepEqual(p.inserts.map((k) => k.t), ["Lead", "LeadEvent", "_LeadTags"]);
});

test("undoing an add removes what hangs off it first, unless it's been edited since", () => {
  const after = [lead({ title: "X" }), event("E1")];
  const p = plan(after, [], now(...after));
  assert.deepEqual(p.deletes.map((k) => k.t), ["LeadEvent", "Lead"]);
  assert.ok(plan(after, [], now(lead({ title: "Y" }), event("E1"))).conflict);
});

test("a row that only pointed here is pointed back, never deleted or made", () => {
  const asset = (r: Row): Kept => ({ t: "ProjectAsset", d: 1, c: "taskId", r: { id: "A1", ...r } });
  // the task was deleted, which unlinked the file
  const p = plan([], [asset({ taskId: "T1", link: "x" })], now(asset({ taskId: null, link: null })));
  assert.deepEqual(p.links.map((l) => l.value), ["T1"]);
  assert.equal(p.inserts.length, 0);
  // the file was linked by the change: undo unlinks it
  const q = plan([asset({ taskId: "T1" })], [], now(asset({ taskId: "T1" })));
  assert.deepEqual(q.links.map((l) => l.value), [null]);
  assert.equal(q.deletes.length, 0);
  // seen before and after: its changed columns go back
  const r = plan([asset({ taskId: null, link: null })], [asset({ taskId: "T1", link: "x" })], now(asset({ taskId: null, link: null })));
  assert.deepEqual(r.updates[0].cols.sort(), ["link", "taskId"]);
});

test("JSON key order doesn't count as a change", () => {
  assert.equal(changedAny([lead({ values: { a: 1, b: 2 } })], [lead({ values: { b: 2, a: 1 } })]), false);
});

test("a pointing row the change deleted comes back on undo and goes again on redo", () => {
  const inv = (r: Row, x?: true): Kept => ({ t: "Invoice", d: 1, c: "projectId", r: { id: "I1", projectId: "P1", ...r }, ...(x ? { x } : {}) });
  const before = [inv({})];
  const after = [inv({}, true)];
  assert.equal(changedAny(before, after), true);
  assert.deepEqual(plan(after, before, now()).inserts.map((k) => k.t), ["Invoice"]);
  assert.deepEqual(plan(before, after, now(inv({}))).deletes.map((k) => k.t), ["Invoice"]);
});
