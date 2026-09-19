import { test } from "node:test";
import assert from "node:assert/strict";
import { exportRow, toCsv, type ExportTask, unionRows } from "./taskExport.ts";

const labels = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  sent_for_client_approval: "Sent for client approval",
  revision_requested: "Revision requested",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};
const h = (n: number) => new Date(Date.UTC(2026, 8, 10, n));
const task: ExportTask = {
  id: "t1", title: "=CL - Gut Instinct", status: "delivered_and_uploaded",
  createdAt: h(0), updatedAt: h(20), dueDate: null, revisionCount: 2, internal: false,
  rawLink: null, frameioLink: null, driveLink: "https://drive", editingNotes: "cut, tight", reviewNotes: null,
  editor: "Sparsh", client: "Courageous Leaders", project: "Podcast", tags: [],
};
const move = (n: number, action: string) => ({ at: h(n), action, actor: "Sparsh" });
const events = [
  move(1, "queued → editing"),
  move(4, "editing → sent_for_approval"),
  move(5, "sent_for_approval → revision_requested"),
  move(7, "revision_requested → sent_for_approval"),
  move(8, "sent_for_approval → sent_for_client_approval"),
  move(10, "sent_for_client_approval → revision_requested"),
  move(12, "revision_requested → sent_for_client_approval"),
  move(13, "sent_for_client_approval → final_export_ready"),
  move(15, "final_export_ready → delivered_and_uploaded"),
];

test("timings and revisions come from the activity log", () => {
  const r = exportRow(task, events, labels, h(30));
  assert.equal(r["Hours: created to first approval request"], 4);
  assert.equal(r["Hours: created to delivered"], 15);
  assert.equal(r["Revisions asked in internal review"], 1);
  assert.equal(r["Revisions asked by client"], 1);
  assert.equal(r["Times sent for approval"], 2);
  assert.equal(r["Hours in Queued"], 1);
  assert.equal(r["Hours in Editing"], 3);
  assert.equal(r["Hours in Sent for approval"], 2); // 4→5 and 7→8
  assert.equal(r["Hours in Revision requested"], 4); // 5→7 and 10→12
  assert.equal(r["Hours in Sent for client approval"], 3); // 8→10 and 12→13
  assert.equal(r["Hours in Final export ready"], 2); // stops once delivered, not at `now`
});

test("an unfinished task keeps accruing time in its current stage", () => {
  const r = exportRow({ ...task, status: "editing" }, events.slice(0, 1), labels, h(6));
  assert.equal(r["Hours in Editing"], 5);
  assert.equal(r["Hours: created to delivered"], "");
  assert.equal(r.Finished, "no");
});

test("CSV quotes and defuses cells", () => {
  const csv = toCsv([exportRow(task, events, labels, h(30))]);
  const [, row] = csv.slice(1).split("\r\n");
  assert.ok(row.startsWith("t1,'=CL - Gut Instinct,Courageous Leaders,"));
  assert.ok(row.includes(',"cut, tight",'));
});

test("a delivery the log never saw closes at the task's last update", () => {
  const r = exportRow({ ...task, updatedAt: h(18) }, events.slice(0, -1), labels, h(30));
  assert.equal(r["Delivered (IST)"], "2026-09-10 23:30");
  assert.equal(r["Hours in Final export ready"], 5); // 13→18, not 13→now
  assert.equal(r["Status changes"], 8);
});

test("a task reopened after delivery isn't delivered", () => {
  const reopened = [...events, move(16, "delivered_and_uploaded → revision_requested")];
  const r = exportRow({ ...task, status: "revision_requested" }, reopened, labels, h(20));
  assert.equal(r["Delivered (IST)"], "");
  assert.equal(r["Hours in Revision requested"], 8); // 4 earlier + 16→20
});

test("rows of different shapes line up as one table", () => {
  const rows = unionRows([
    { Task: "Trailer", "Hours in Editing": 3 },
    { Task: "Website copy", Person: "Jyotsna" },
  ]);
  assert.deepEqual(Object.keys(rows[0]), ["Task", "Hours in Editing", "Person"]);
  assert.equal(rows[0].Person, "");
  assert.equal(rows[1]["Hours in Editing"], "");
  assert.equal(toCsv(rows).split("\r\n")[0], "﻿Task,Hours in Editing,Person");
});
