import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeWhere,
  canAssign,
  canEditPeople,
  canEditTag,
  canSeeMember,
  canSetAccess,
  peopleWhere,
  runsClients,
  runsProduction,
  seesEveryTeam,
  visibleClientWhere,
  visibleTagWhere,
  worksTheBoard,
  type Viewer,
} from "./scope.ts";

const PROD = { id: "t-prod", slug: "production" };
const CS = { id: "t-cs", slug: "client-services" };
const SALES = { id: "t-sales", slug: "sales" };

const ashmit: Viewer = { id: "u-ashmit", role: "admin", email: "ashmit@easeus.media", teamId: null, departments: [] };
const abhishek: Viewer = { id: "u-abhishek", role: "admin", email: "abhishek@easeus.media", teamId: PROD.id, departments: [PROD] };
const jyotsna: Viewer = { id: "u-jyotsna", role: "core", email: "j@easeus.media", teamId: CS.id, departments: [CS, PROD] };
const pankaj: Viewer = { id: "u-pankaj", role: "core", email: "p@easeus.media", teamId: SALES.id, departments: [SALES] };
const sparsh: Viewer = { id: "u-sparsh", role: "employee", email: "s@easeus.media", teamId: PROD.id, departments: [PROD] };
const unplaced: Viewer = { id: "u-new", role: "core", email: "n@easeus.media", teamId: null, departments: [] };

const person = (v: Viewer) => ({ id: v.id, role: v.role, teamId: v.teamId, departmentIds: v.departments.map((d) => d.id) });

test("Founders see everything; a Member only their own work", () => {
  assert.deepEqual(assigneeWhere(ashmit), {});
  assert.deepEqual(assigneeWhere(abhishek), {});
  assert.deepEqual(assigneeWhere(sparsh), { OR: [{ assignedToId: sparsh.id }, { shares: { some: { userId: sparsh.id } } }] });
  assert.equal(seesEveryTeam(abhishek), true);
  assert.equal(seesEveryTeam(jyotsna), false);
});

test("a Lead sees their departments' work and their own, never a Founder's", () => {
  assert.deepEqual(assigneeWhere(jyotsna), {
    OR: [{ assignedToId: jyotsna.id }, { shares: { some: { userId: jyotsna.id } } }, { teamId: { in: [CS.id, PROD.id] }, NOT: { assignedTo: { role: "admin" } } }],
  });
  // a Lead with no department sees only themselves
  assert.deepEqual(assigneeWhere(unplaced), {
    OR: [{ assignedToId: unplaced.id }, { shares: { some: { userId: unplaced.id } } }, { teamId: { in: [] }, NOT: { assignedTo: { role: "admin" } } }],
  });
});

test("the directory: a Lead sees the non-Founders in their departments", () => {
  assert.deepEqual(peopleWhere(ashmit), {});
  assert.deepEqual(peopleWhere(sparsh), { id: sparsh.id });
  assert.deepEqual(peopleWhere(pankaj), {
    OR: [{ id: pankaj.id }, { role: { not: "admin" }, OR: [{ teamId: { in: [SALES.id] } }, { departments: { some: { id: { in: [SALES.id] } } } }] }],
  });
  assert.equal(canSeeMember(jyotsna, person(sparsh)), true);
  assert.equal(canSeeMember(jyotsna, person(abhishek)), false); // never upward
  assert.equal(canSeeMember(pankaj, person(sparsh)), false); // another department
  assert.equal(canSeeMember(sparsh, person(jyotsna)), false);
  assert.equal(canSeeMember(sparsh, person(sparsh)), true);
});

test("work is handed down the levels only", () => {
  assert.equal(canAssign(ashmit, person(jyotsna)), true);
  assert.equal(canAssign(jyotsna, person(sparsh)), true);
  assert.equal(canAssign(jyotsna, person(pankaj)), false); // Lead to Lead
  assert.equal(canAssign(jyotsna, person(abhishek)), false); // upward
  assert.equal(canAssign(pankaj, person(sparsh)), false); // not their department
  assert.equal(canAssign(sparsh, person(sparsh)), true);
  assert.equal(canAssign(sparsh, person(jyotsna)), false);
});

test("a Lead sets a Member's departments and roles; only a Founder sets anyone's", () => {
  assert.equal(canSetAccess(jyotsna, person(sparsh)), true);
  assert.equal(canSetAccess(jyotsna, person(pankaj)), false);
  assert.equal(canSetAccess(ashmit, person(jyotsna)), true);
  assert.equal(canSetAccess(sparsh, person(sparsh)), false);
  assert.equal(canEditPeople(ashmit), true);
  assert.equal(canEditPeople(jyotsna), false);
});

test("what each department's features are for", () => {
  assert.equal(runsClients(jyotsna), true);
  assert.equal(runsClients(pankaj), false);
  assert.equal(runsClients(ashmit), true);
  assert.equal(runsProduction(jyotsna), true);
  assert.equal(runsProduction(pankaj), false);
  assert.equal(worksTheBoard(sparsh), true);
  assert.equal(worksTheBoard(jyotsna), false);
});

test("kinds of work follow departments; clients are all visible except to a Member", () => {
  // Level 1 has no department, so no Production kinds
  assert.deepEqual(visibleTagWhere(ashmit), { OR: [{ teamId: null }, { teamId: { in: [] } }] });
  assert.deepEqual(visibleTagWhere(pankaj), { OR: [{ teamId: null }, { teamId: { in: [SALES.id] } }] });
  assert.equal(canEditTag(pankaj, { teamId: SALES.id }), true);
  assert.equal(canEditTag(pankaj, { teamId: PROD.id }), false);
  assert.equal(canEditTag(pankaj, { teamId: null }), false);
  assert.deepEqual(visibleClientWhere(jyotsna), {});
  assert.deepEqual(visibleClientWhere(sparsh), { editors: { some: { id: sparsh.id } } });
});
