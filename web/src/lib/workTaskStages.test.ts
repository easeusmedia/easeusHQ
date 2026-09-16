import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasks } from "./workTaskStages.ts";

const ops = { slug: "operations", name: "Operations" };
const sales = { slug: "sales", name: "Sales" };
const teams = [ops.slug, sales.slug];
const sparsh = { id: "s", name: "Sparsh", team: ops, role: "Video editor" };
const pankaj = { id: "p", name: "Pankaj", team: sales, role: "Sales executive" };
const arpit = { id: "a", name: "Arpit", team: ops, role: "Project manager" };

const work = [
  { id: "w1", status: "done" as const, sortOrder: 1, assignedTo: arpit },
  { id: "w2", status: "todo" as const, sortOrder: 2, assignedTo: pankaj },
  { id: "w3", status: "todo" as const, sortOrder: 1, assignedTo: arpit },
];
const queue = [
  { id: "q1", status: "sent_for_client_approval" as const, assignedTo: sparsh },
  { id: "q2", status: "final_export_ready" as const, assignedTo: sparsh },
  { id: "q3", status: "queued" as const, assignedTo: null },
];

test("by status, editing-queue tasks land in the matching column", () => {
  const g = groupTasks("status", work, queue, teams);
  assert.deepEqual(g.map((x) => x.key), ["todo", "in_progress", "in_review", "done"]);
  assert.deepEqual(g[0].queue.map((q) => q.id), ["q3"]);
  assert.deepEqual(g[2].queue.map((q) => q.id), ["q1"]);
  assert.deepEqual(g[3].queue.map((q) => q.id), ["q2"]);
});

test("by person, both kinds of task sit under whoever has them, A–Z, unassigned last", () => {
  const g = groupTasks("person", work, queue, teams);
  assert.deepEqual(g.map((x) => x.label), ["Arpit", "Pankaj", "Sparsh", "Unassigned"]);
  assert.deepEqual(g[0].work.map((w) => w.id), ["w3", "w1"]); // to do before done
  assert.equal(g[2].queue.length, 2);
});

test("by team, teams keep their own order", () => {
  const g = groupTasks("team", work, queue, teams);
  assert.deepEqual(g.map((x) => x.label), ["Operations", "Sales", "No team"]);
  assert.equal(g[0].work.length + g[0].queue.length, 4);
});

test("by role, each part of the organization gets its own group, in the roles' own order", () => {
  const g = groupTasks("role", work, queue, ["Video editor", "Project manager", "Sales executive"]);
  assert.deepEqual(g.map((x) => x.label), ["Video editor", "Project manager", "Sales executive", "No role"]);
  assert.deepEqual(g[0].queue.map((q) => q.id), ["q1", "q2"]);
});
