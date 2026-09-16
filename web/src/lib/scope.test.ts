import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeWhere,
  canEditPeople,
  canEditTag,
  canSeeMember,
  seesAllWork,
  seesEveryTeam,
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

test("only admin and Abhishek have admin-level access", () => {
  assert.equal(seesEveryTeam(ashmit), true);
  assert.equal(seesEveryTeam(abhishek), true); // core by role, full access by identity
  assert.equal(seesEveryTeam(arpit), false);
  assert.equal(seesEveryTeam(pankaj), false);
});

test("every core member sees all work; an employee sees only their own", () => {
  assert.equal(seesAllWork(ashmit), true);
  assert.equal(seesAllWork(arpit), true);
  assert.equal(seesAllWork(pankaj), true);
  assert.equal(seesAllWork(sparsh), false);
  assert.deepEqual(assigneeWhere(pankaj), {});
  assert.deepEqual(assigneeWhere(sparsh), { assignedToId: "u-sparsh" });
});

test("core members see across teams; an employee sees no one else", () => {
  assert.equal(canSeeMember(pankaj, sparsh), true);
  assert.equal(canSeeMember(arpit, pankaj), true);
  assert.equal(canSeeMember(sparsh, arpit), false);
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
