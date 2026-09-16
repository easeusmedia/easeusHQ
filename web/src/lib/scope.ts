import type { Role } from "@prisma/client";

// Who can see whose work, and who can change what.
//
//   admin / Abhishek  → everyone's work, and the People records (pay, roles)
//   core              → everyone's work, every team; People is read-only and
//                       limited to their own team, tags to their own team's
//   employee          → their own work only
//
// Core members used to see only their own team's work. The leads asked to
// see all of it, so work visibility is now simply "not an employee"; what
// stays team-bound is the People directory and each team's tag vocabulary.
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

// Everyone's work, across every team — or only your own.
export function seesAllWork(user: Pick<Viewer, "role" | "email">): boolean {
  return user.role !== "employee" || seesEveryTeam(user);
}

// A Prisma `where` fragment for any model with an assignee. Used for
// WorkTask and Task alike, so one rule covers both task systems.
export function assigneeWhere(user: Viewer): Record<string, unknown> {
  return seesAllWork(user) ? {} : { assignedToId: user.id };
}

// Whether `viewer` may see `target`'s work, and so hand them a task.
export function canSeeMember(viewer: Viewer, target: Pick<Viewer, "id">): boolean {
  return viewer.id === target.id || seesAllWork(viewer);
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
