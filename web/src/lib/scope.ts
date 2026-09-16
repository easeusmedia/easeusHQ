import type { Role } from "@prisma/client";

// Who can see whose work.
//
// Three concentric rings, and every list in the app is filtered by exactly
// one of them rather than each page inventing its own rule:
//
//   admin / Abhishek  → every team, everyone's work
//   core              → their own team's work, for every member of it
//   employee          → their own work only
//
// Team is the unit, not role: "the Operations core team sees Operations" is
// the requirement, so a core member with no team set sees only themselves
// (fail closed) rather than accidentally seeing everything.
export type Viewer = {
  id: string;
  role: Role;
  email: string;
  teamId: string | null;
};

// Abhishek is the developer and sits at admin level wherever access is
// gated, even though his role is core — same rule as lib/actingUser.ts,
// which this deliberately mirrors rather than re-deciding.
const FULL_ACCESS_EMAIL = "abhishek@easeus.media";

export function seesEveryTeam(user: Pick<Viewer, "role" | "email">): boolean {
  return user.role === "admin" || user.email === FULL_ACCESS_EMAIL;
}

// How wide this person's view is. "all" is unrestricted; a team id means
// that team only; null means just themselves.
export function viewScope(user: Viewer): "all" | { teamId: string } | null {
  if (seesEveryTeam(user)) return "all";
  if (user.role === "core" && user.teamId) return { teamId: user.teamId };
  return null;
}

// A Prisma `where` fragment for any model with an assignee, expressed in
// terms of that assignee's own fields. Used for WorkTask.assignedTo and
// Task.assignedTo alike, so one rule covers both task systems.
export function assigneeWhere(user: Viewer): Record<string, unknown> {
  const scope = viewScope(user);
  if (scope === "all") return {};
  if (scope === null) return { assignedToId: user.id };
  return { assignedTo: { teamId: scope.teamId } };
}

// Whether `viewer` may open `target`'s profile and work history.
export function canSeeMember(viewer: Viewer, target: Pick<Viewer, "id" | "teamId">): boolean {
  if (viewer.id === target.id) return true; // always yourself
  const scope = viewScope(viewer);
  if (scope === "all") return true;
  if (scope === null) return false;
  return !!target.teamId && target.teamId === scope.teamId;
}

// Only admin (and Abhishek) change what someone is paid, what they're
// called, or what they can see. A core member runs their team's work, not
// its employment terms.
export function canEditPeople(user: Pick<Viewer, "role" | "email">): boolean {
  return seesEveryTeam(user);
}

// Tags belong to a team, so a picker only ever offers the kinds of work
// that team actually does. Shared tags (no team) are offered to everyone;
// someone who sees every team gets the lot.
export function visibleTagWhere(user: Viewer): Record<string, unknown> {
  if (seesEveryTeam(user)) return {};
  return { OR: [{ teamId: null }, ...(user.teamId ? [{ teamId: user.teamId }] : [])] };
}

// Core members curate their own team's vocabulary; admin curates anyone's.
// Nobody can delete a shared tag except someone who sees every team.
export function canEditTag(user: Viewer, tag: { teamId: string | null }): boolean {
  if (seesEveryTeam(user)) return true;
  if (user.role !== "core" || !user.teamId) return false;
  return tag.teamId === user.teamId;
}

// What clients write from their shared page is for whoever runs client work:
// admin and Abhishek, and Operations' core members — not editors, not Sales.
export function seesClientFeedback(user: Pick<Viewer, "role" | "email" | "teamId">, operationsTeamId: string | null): boolean {
  if (seesEveryTeam(user)) return true;
  return user.role === "core" && !!user.teamId && user.teamId === operationsTeamId;
}
