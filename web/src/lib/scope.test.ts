import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeWhere,
  canEditPeople,
  canEditTag,
  canSeeMember,
  seesEveryTeam,
  viewScope,
  visibleTagWhere,
  type Viewer,
} from "./scope.ts";

const OPS = "team-ops";
const SALES = "team-sales";

const ashmit: Viewer = { id: "u-ashmit", role: "admin", email: "ashmit@easeus.media", teamId: OPS };
const abhishek: Viewer = { id: "u-abhi", role: "core", email: "abhishek@easeus.media", teamId: OPS };
const arpit: Viewer = { id: "u-arpit", role: "core", email: "arpit@easeus.media", teamId: OPS };
const pankaj: Viewer = { id: "u-pankaj", role: "core", email: "pankaj@easeus.media", teamId: SALES };
const sparsh: Viewer = { id: "u-sparsh", role: "employee", email: "sparsh@easeus.media", teamId: OPS };

test("admin and Abhishek see every team; other core members do not", () => {
  assert.equal(seesEveryTeam(ashmit), true);
  assert.equal(seesEveryTeam(abhishek), true); // core by role, full access by identity
  assert.equal(seesEveryTeam(arpit), false);
  assert.equal(seesEveryTeam(pankaj), false);
});

test("a core member's scope is their own team; an employee's is themselves", () => {
  assert.deepEqual(viewScope(ashmit), "all");
  assert.deepEqual(viewScope(arpit), { teamId: OPS });
  assert.deepEqual(viewScope(pankaj), { teamId: SALES });
  assert.equal(viewScope(sparsh), null);
});

test("a core member with no team set falls back to themselves, not to everything", () => {
  const stray: Viewer = { id: "u-x", role: "core", email: "x@easeus.media", teamId: null };
  assert.equal(viewScope(stray), null);
  assert.deepEqual(assigneeWhere(stray), { assignedToId: "u-x" });
});

test("the task filter matches the scope", () => {
  assert.deepEqual(assigneeWhere(ashmit), {});
  assert.deepEqual(assigneeWhere(arpit), { assignedTo: { teamId: OPS } });
  assert.deepEqual(assigneeWhere(sparsh), { assignedToId: "u-sparsh" });
});

test("Sales core cannot see Operations people, and vice versa", () => {
  assert.equal(canSeeMember(pankaj, sparsh), false);
  assert.equal(canSeeMember(arpit, pankaj), false);
  assert.equal(canSeeMember(arpit, sparsh), true); // same team
  assert.equal(canSeeMember(ashmit, pankaj), true); // admin sees all
});

test("everyone can see themselves, including an employee", () => {
  assert.equal(canSeeMember(sparsh, sparsh), true);
  assert.equal(canSeeMember(pankaj, pankaj), true);
});

test("only admin/Abhishek edit employment records", () => {
  assert.equal(canEditPeople(ashmit), true);
  assert.equal(canEditPeople(abhishek), true);
  assert.equal(canEditPeople(arpit), false);
  assert.equal(canEditPeople(sparsh), false);
});

test("a team only sees its own tags, plus shared ones", () => {
  assert.deepEqual(visibleTagWhere(ashmit), {});
  assert.deepEqual(visibleTagWhere(pankaj), { OR: [{ teamId: null }, { teamId: SALES }] });
});

test("core members curate only their own team's tags", () => {
  assert.equal(canEditTag(arpit, { teamId: OPS }), true);
  assert.equal(canEditTag(arpit, { teamId: SALES }), false);
  // a shared tag is everyone's, so no single team may delete it
  assert.equal(canEditTag(arpit, { teamId: null }), false);
  assert.equal(canEditTag(ashmit, { teamId: null }), true);
  // an employee never curates tags
  assert.equal(canEditTag(sparsh, { teamId: OPS }), false);
});
