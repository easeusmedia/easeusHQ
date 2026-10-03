"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople, canSetAccess, isFounder, type Viewer } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { isStorablePicture } from "@/lib/photos";
import { revalidatePath } from "next/cache";
import type { EmploymentStatus, Role } from "@prisma/client";
import { EMPLOYMENT_TYPE_LABEL, slugOf } from "@/lib/teams";
import { hashPassword } from "@/lib/password";
import { MIN_PASSWORD } from "@/lib/account";

export type PeopleFormState = { error?: string; success?: boolean };

// Everything here re-derives the actor from the session. An employment
// record is the most sensitive thing in this app — what people are paid,
// what they can see — so none of it takes a role or an id on trust from
// whoever happened to call the action.
async function requirePeopleAdmin(): Promise<Viewer | null> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return null;
  const actor = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, role: true, email: true, teamId: true, departments: { select: { id: true, slug: true } } },
  });
  if (!actor || !canEditPeople(actor)) return null;
  return actor;
}

// Someone's photo. Everyone can change their own, whatever their role;
// admin (and Abhishek) can change anyone's. Only ever a small image — the
// browser resizes it before sending.
export async function updatePersonPhoto(userId: string, dataUrl: string | null): Promise<PeopleFormState> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return { error: "Your session has ended. Please sign in again." };
  if (userId !== sessionUserId && !(await requirePeopleAdmin())) {
    return { error: "Only Level 1 can change someone else's photo." };
  }
  if (dataUrl !== null && !isStorablePicture(dataUrl)) return { error: "That image couldn't be used. Please try a JPEG or PNG." };

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
  // the photo shows everywhere, so every page's layout needs it
  revalidatePath("/", "layout");
  return { success: true };
}

// A new password for someone who's lost theirs, set by Level 1 (who then
// tells them it; they can change it themselves under Account). Only Level 1:
// whoever holds this can sign in as anyone.
export async function resetPassword(personId: string, password: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can reset a password." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password.length > 200) return { error: "That password is too long." };
  const person = await prisma.user.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) return { error: "That person no longer exists." };
  await prisma.user.update({ where: { id: personId }, data: { passwordHash: hashPassword(password) } });
  return { success: true };
}

const ROLES: Role[] = ["admin", "core", "employee"];
const EMPLOYMENT: EmploymentStatus[] = ["active", "on_leave", "former"];
const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABEL);
const day = (v: string) => (v ? new Date(`${v}T00:00:00Z`) : null);

// One save for the whole profile rather than a dozen field-level actions:
// the detail pane edits as a form and commits as a form.
export async function updatePerson(input: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  joinedAt: string;
  salary: string;
  employment: string;
  employmentType: string;
  position: string;
  birthday: string;
  emergencyContact: string;
  notes: string;
}): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can change someone's record." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { error: "A name is required." };
  if (!email) return { error: "An email is required." };
  if (!ROLES.includes(input.role as Role)) return { error: "That isn't a valid access level." };
  if (!EMPLOYMENT.includes(input.employment as EmploymentStatus)) return { error: "That isn't a valid status." };
  if (input.employmentType && !EMPLOYMENT_TYPES.includes(input.employmentType)) return { error: "That isn't a valid employment type." };

  // Nobody can strip their own Level 1 — one misclick would lock the
  // only person who can undo it out of the thing they'd need to undo it.
  if (input.id === actor.id && input.role !== "admin" && actor.role === "admin") {
    return { error: "You can't take away your own Level 1." };
  }

  const clash = await prisma.user.findFirst({ where: { email, id: { not: input.id } }, select: { id: true } });
  if (clash) return { error: "Someone else already uses that email." };

  const salary = input.salary.trim() ? Number(input.salary.replace(/[^0-9.]/g, "")) : null;
  if (salary !== null && !Number.isFinite(salary)) return { error: "That salary isn't a number." };

  await prisma.user.update({
    where: { id: input.id },
    data: {
      name,
      email,
      phone: input.phone.trim() || null,
      role: input.role as Role,
      joinedAt: day(input.joinedAt),
      salary,
      employment: input.employment as EmploymentStatus,
      employmentType: input.employmentType || null,
      position: input.position.trim() || null,
      birthday: day(input.birthday),
      emergencyContact: input.emergencyContact.trim() || null,
      notes: input.notes.trim() || null,
    },
  });

  revalidatePath("/team");
  revalidatePath("/finance");
  return { success: true };
}

// Someone's departments and roles. A Founder sets anyone's; a Lead a
// Member's, and only within their own departments: whatever the Member has
// elsewhere is kept as it is, whatever was sent (lib/scope canSetAccess).
export async function setAccess(personId: string, input: { departmentIds: string[]; roleIds: string[] }): Promise<PeopleFormState> {
  const actor = await getViewer();
  if (!actor) return { error: "Your session has ended. Please sign in again." };
  const target = await prisma.user.findUnique({
    where: { id: personId },
    select: { id: true, role: true, teamId: true, departments: { select: { id: true } }, roles: { select: { id: true, teamId: true } } },
  });
  if (!target) return { error: "That person no longer exists." };
  if (!canSetAccess(actor, { ...target, departmentIds: target.departments.map((d) => d.id) })) {
    return { error: "You can only change the departments and roles of the Members in your departments." };
  }

  const founder = isFounder(actor);
  const mine = new Set(actor.departments.map((d) => d.id));
  const [teams, roles] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: input.departmentIds } }, select: { id: true } }),
    prisma.jobTitle.findMany({ where: { id: { in: input.roleIds } }, select: { id: true, teamId: true } }),
  ]);
  // a Lead changes only what's within their departments
  const yours = (teamId: string | null) => founder || (!!teamId && mine.has(teamId));
  const departmentIds = [...new Set([...target.departments.map((d) => d.id).filter((id) => !yours(id)), ...teams.map((t) => t.id).filter(yours)])];
  // a role only ever sits inside one of their departments, or outside them
  // all (one that takes requests: Level 1's to give, since `yours` is theirs
  // alone for no department)
  const roleIds = [...new Set([...target.roles.filter((r) => !yours(r.teamId)).map((r) => r.id), ...roles.filter((r) => yours(r.teamId)).map((r) => r.id)])].filter((id) => {
    const teamId = [...target.roles, ...roles].find((r) => r.id === id)?.teamId;
    return teamId === null || departmentIds.includes(teamId ?? "");
  });
  // the department they're shown under: the one they had, while they're still in it
  const teamId = target.teamId && departmentIds.includes(target.teamId) ? target.teamId : (departmentIds[0] ?? null);

  await prisma.user.update({
    where: { id: personId },
    data: { teamId, departments: { set: departmentIds.map((id) => ({ id })) }, roles: { set: roleIds.map((id) => ({ id })) } },
  });
  revalidatePath("/team");
  return { success: true };
}

// Positions and departments. Nothing here revalidates: the page is heavy,
// and whoever is editing the list keeps it in their own state and refreshes
// once when they're done, rather than reloading the page on every change.

// Job titles are descriptive and grant nothing (see schema.prisma), which
// is exactly why admin can add and remove them freely. One of the same name
// is simply picked rather than refused. No department: a leadership title.
export async function createJobTitle(name: string, teamId: string | null): Promise<PeopleFormState & { id?: string; name?: string; teamId?: string | null }> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can add a role." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the role a name." };

  const existing = await prisma.jobTitle.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return { success: true, id: existing.id, name: existing.name, teamId: existing.teamId };
  if (teamId && !(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) return { error: "That department no longer exists." };

  const last = await prisma.jobTitle.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.jobTitle.create({ data: { name: trimmed, teamId, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  return { success: true, id: created.id, name: created.name, teamId: created.teamId };
}

export async function deleteJobTitle(id: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can remove a role." };

  // Unset it from whoever holds it rather than refusing: the title is a
  // label, and blocking the delete would mean hunting down every holder
  // first. Their access and department are untouched; only the label goes.
  await prisma.user.updateMany({ where: { jobTitleId: id }, data: { jobTitleId: null } });
  await prisma.jobTitle.delete({ where: { id } });
  return { success: true };
}

// A department's or a role's new name. Only the name changes: the
// department's address (its slug), what it grants and everyone in it stay.
export async function renameDepartment(id: string, name: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can rename a department." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the department a name." };
  const clash = await prisma.team.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, id: { not: id } } });
  if (clash) return { error: `"${clash.name}" already exists.` };
  await prisma.team.update({ where: { id }, data: { name: trimmed } });
  return { success: true };
}

// The words in a task's title that file it under this department
// (lib/department.ts), as typed: "edit, reel, thumbnail"
export async function setDepartmentWords(id: string, keywords: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can change a department." };
  const clean = keywords
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .join(", ");
  await prisma.team.update({ where: { id }, data: { keywords: clean } });
  return { success: true };
}

export async function renameRole(id: string, name: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can rename a role." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the role a name." };
  const clash = await prisma.jobTitle.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, id: { not: id } } });
  if (clash) return { error: `"${clash.name}" already exists.` };
  await prisma.jobTitle.update({ where: { id }, data: { name: trimmed } });
  return { success: true };
}

// A new side of the agency. It works like the others from the start: its
// core members see its work, and its task tags are offered to it.
export async function createDepartment(name: string): Promise<PeopleFormState & { id?: string; name?: string; slug?: string }> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can add a department." };
  const trimmed = name.trim();
  const slug = slugOf(trimmed);
  if (!slug) return { error: "Give the department a name." };

  const clash = await prisma.team.findFirst({ where: { OR: [{ slug }, { name: { equals: trimmed, mode: "insensitive" } }] } });
  if (clash) return { error: `"${clash.name}" already exists.` };

  const last = await prisma.team.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.team.create({ data: { name: trimmed, slug, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  return { success: true, id: created.id, name: created.name, slug: created.slug };
}

// Only an empty department goes: who sits in one decides what they can see,
// so moving people out is a choice made person by person. Production and
// Client success stay: the editing queue and client feedback are built on
// them. Its roles go with it; its kinds of work become shared by everyone.
export async function deleteDepartment(id: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can remove a department." };
  const team = await prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true, access: true } } } });
  if (!team) return { success: true };
  const inIt = Math.max(team._count.members, team._count.access);
  if (team.slug === "production" || team.slug === "client-services") return { error: `${team.name} can't be removed: the ${team.slug === "production" ? "editing queue" : "client work"} runs on it.` };
  if (inIt) {
    return { error: `${team.name} still has ${inIt} ${inIt === 1 ? "person" : "people"}. Take them out of it first.` };
  }
  // its own sections, portals and boards (Sales > Outreach…) must go first
  if (await prisma.space.count({ where: { teamId: id } })) return { error: `${team.name} still has its own pages. Delete its sections first.` };

  await prisma.$transaction([
    prisma.taskTag.updateMany({ where: { teamId: id }, data: { teamId: null } }),
    prisma.jobTitle.deleteMany({ where: { teamId: id } }),
    prisma.team.delete({ where: { id } }),
  ]);
  return { success: true };
}

// A department's work tags: the kinds of work its tasks are labelled with
// ("Reel", "Proposal"), offered on the Type chip to that department. Same
// rule as positions: one of the same name anywhere is refused, not doubled.
export async function createWorkTag(name: string, teamId: string, roleId?: string): Promise<PeopleFormState & { id?: string; name?: string; workflow?: string }> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can add a work tag." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the work tag a name." };

  const existing = await prisma.taskTag.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } }, include: { team: true } });
  if (existing) return { error: `"${existing.name}" already exists${existing.team ? `, under ${existing.team.name}` : ""}.` };
  if (!(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) return { error: "That department no longer exists." };

  const last = await prisma.taskTag.findFirst({ orderBy: { sortOrder: "desc" } });
  // it moves as its role's tasks do
  const role = roleId ? await prisma.jobTitle.findUnique({ where: { id: roleId }, select: { workflow: true } }) : null;
  const created = await prisma.taskTag.create({ data: { name: trimmed, teamId, roleId: role ? roleId : null, workflow: role?.workflow ?? "todo", sortOrder: (last?.sortOrder ?? 0) + 1 } });
  return { success: true, id: created.id, name: created.name, workflow: created.workflow };
}

// Every task tagged with it loses the tag; the tasks themselves stay.
export async function deleteWorkTag(id: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only Level 1 can remove a work tag." };
  await prisma.taskTag.deleteMany({ where: { id } });
  return { success: true };
}
