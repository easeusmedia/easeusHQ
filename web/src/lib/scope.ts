import type { Role } from "@prisma/client";

// Who can see whose work.
//
// Three levels, and every list in the app is filtered by exactly one rule
// rather than each page inventing its own:
//
//   Level 1 (admin)    → everything, everyone's work
//   Level 2 (core)     → the work in the departments they've been given, of
//                        everyone but Level 1
//   Level 3 (employee) → their own work only
//
// Nobody sees upward: a Lead never sees a Founder's work or access, and a
// Member sees no one else's. Departments are the unit a Lead sees by; a
// Lead with none sees only themselves (fail closed).
export type Viewer = {
  id: string;
  role: Role;
  email: string;
  teamId: string | null;
  // the departments they work in or (a Lead) run
  departments: { id: string; slug: string }[];
};

export const LEVEL_LABEL: Record<Role, string> = { admin: "Level 1", core: "Level 2", employee: "Level 3" };
export const LEVEL_NOTE: Record<Role, string> = {
  admin: "Sees and runs everything",
  core: "Sees and assigns the work in their departments",
  employee: "Sees their own work",
};

// The departments the app's own features are built on: the editing queue
// is Production's; clients, their feedback and posting dates are Client
// Services' and Distribution's.
export const DEPT = { production: "production", clientServices: "client-services", distribution: "distribution", sales: "sales" } as const;

// Abhishek, the developer, shows as Level 2 but keeps everything Level 1
// has, wherever access is decided. (Level 2 can still see his work: what's
// hidden from them is Level 1's by level, not his.)
const DEVELOPER = "abhishek@easeus.media";
export const isFounder = (u: { role: string; email?: string | null }) => u.role === "admin" || u.email === DEVELOPER;
// the role a page acts with: full access counts as Level 1's
export const effectiveRole = <R extends string>(u: { role: R; email?: string | null }): R | "admin" => (isFounder(u) ? "admin" : u.role);
export const isLead = (u: { role: string }) => u.role === "core";
export const isMember = (u: { role: string }) => u.role === "employee";

const inDepartment = (u: Pick<Viewer, "departments">, slug: string) => u.departments.some((d) => d.slug === slug);
const departmentIds = (u: Pick<Viewer, "departments">) => u.departments.map((d) => d.id);

export function seesEveryTeam(user: { role: string; email?: string | null }): boolean {
  return isFounder(user);
}

// Clients' feedback, posting dates and client records: Level 1, and the
// Leads of Client Services and Distribution.
export function runsClients(user: Pick<Viewer, "role" | "departments">): boolean {
  return isFounder(user) || (isLead(user) && [DEPT.clientServices, DEPT.distribution].some((d) => inDepartment(user, d)));
}

// The editing queue, to see and hand out: Founders, and Production's Leads.
export function runsProduction(user: Pick<Viewer, "role" | "departments">): boolean {
  return isFounder(user) || (isLead(user) && inDepartment(user, DEPT.production));
}

// A Member in Production (an editor, a designer): they work from the
// Board, and see a client only as far as their own work on it goes.
export function worksTheBoard(user: Pick<Viewer, "role" | "departments">): boolean {
  return isMember(user) && inDepartment(user, DEPT.production);
}

// A Prisma `where` for Task and WorkTask alike: whose work this person
// sees. Everyone sees their own and what they've been added to; a Lead
// their departments' work too, never a Founder's.
export function assigneeWhere(user: Viewer): Record<string, unknown> {
  if (isFounder(user)) return {};
  const own = [{ assignedToId: user.id }, { shares: { some: { userId: user.id } } }];
  if (isLead(user)) {
    return {
      OR: [
        ...own,
        // unassigned work included; works for WorkTask's required assignee too
        { teamId: { in: departmentIds(user) }, NOT: { assignedTo: { role: "admin" } } },
      ],
    };
  }
  return { OR: own };
}

// The people someone sees in the directory and can hand work to: a Lead,
// the non-Founders in their departments; a Member, themselves.
export function peopleWhere(user: Viewer): Record<string, unknown> {
  if (isFounder(user)) return {};
  if (isLead(user)) {
    const ids = departmentIds(user);
    return { OR: [{ id: user.id }, { role: { not: "admin" }, OR: [{ teamId: { in: ids } }, { departments: { some: { id: { in: ids } } } }] }] };
  }
  return { id: user.id };
}

// Whether `viewer` may open `target`'s profile and work history.
export function canSeeMember(viewer: Viewer, target: { id: string; role: string; teamId: string | null; departmentIds?: string[] }): boolean {
  if (viewer.id === target.id) return true;
  if (isFounder(viewer)) return true;
  if (!isLead(viewer) || isFounder(target)) return false;
  const mine = departmentIds(viewer);
  return (!!target.teamId && mine.includes(target.teamId)) || (target.departmentIds ?? []).some((d) => mine.includes(d));
}

// Who can hand work to whom: down the levels. A Founder to anyone; a Lead
// to themselves and the Members in their departments; a Member to
// themselves.
export function canAssign(viewer: Viewer, target: { id: string; role: string; teamId: string | null; departmentIds?: string[] }): boolean {
  if (viewer.id === target.id || isFounder(viewer)) return true;
  return isLead(viewer) && isMember(target) && canSeeMember(viewer, target);
}

// A Member's departments and roles: a Founder sets anyone's; a Lead sets a
// Member's, within their own departments.
export function canSetAccess(viewer: Viewer, target: { id: string; role: string; teamId: string | null; departmentIds?: string[] }): boolean {
  if (isFounder(viewer)) return true;
  return isLead(viewer) && isMember(target) && canSeeMember(viewer, target);
}

// Only Founders change what someone is paid, what they're called, or their
// level.
export function canEditPeople(user: { role: string; email?: string | null }): boolean {
  return isFounder(user);
}

// Kinds of work belong to a department, so a picker only offers the kinds
// someone's departments do: Production's (Reel, Thumbnail…) only to people
// in Production, Level 1 included. Shared ones (no department) go to everyone.
export function visibleTagWhere(user: Viewer): Record<string, unknown> {
  return { OR: [{ teamId: null }, { teamId: { in: departmentIds(user) } }] };
}

// Leads curate their departments' kinds of work; Founders anyone's. Only a
// Founder deletes a shared one.
export function canEditTag(user: Viewer, tag: { teamId: string | null }): boolean {
  if (isFounder(user)) return true;
  if (!isLead(user) || !tag.teamId) return false;
  return departmentIds(user).includes(tag.teamId);
}

// Which clients someone sees. Level 1 every client; Level 2 every client
// but the ones taken from them; Level 3 only the ones given to them, so a
// new client isn't shown to every editor the day it signs. Both are set
// from the client's own page (clients/EditorAccess).
export function visibleClientWhere(user: { id: string; role: string; email?: string | null }): Record<string, unknown> {
  if (isFounder(user)) return {};
  if (isMember(user)) return { editors: { some: { id: user.id } } };
  return { hiddenFrom: { none: { id: user.id } } };
}

// The same, for a client already loaded with its access lists
export function seesClient(user: { id: string; role: string; email?: string | null }, client: { editors: { id: string }[]; hiddenFrom: { id: string }[] }): boolean {
  if (isFounder(user)) return true;
  if (isMember(user)) return client.editors.some((e) => e.id === user.id);
  return !client.hiddenFrom.some((e) => e.id === user.id);
}
