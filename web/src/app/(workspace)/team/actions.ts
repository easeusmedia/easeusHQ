"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople, type Viewer } from "@/lib/scope";
import { isStorablePicture } from "@/lib/photos";
import { revalidatePath } from "next/cache";
import type { EmploymentStatus, Role } from "@prisma/client";
import { departmentFor, EMPLOYMENT_TYPE_LABEL, slugOf } from "@/lib/teams";

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
    select: { id: true, role: true, email: true, teamId: true },
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
    return { error: "Only the admin can change someone else's photo." };
  }
  if (dataUrl !== null && !isStorablePicture(dataUrl)) return { error: "That image couldn't be used. Please try a JPEG or PNG." };

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
  // the photo shows everywhere, so every page's layout needs it
  revalidatePath("/", "layout");
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
  teamId: string;
  jobTitleId: string;
  joinedAt: string;
  salary: string;
  employment: string;
  employmentType: string;
  birthday: string;
  emergencyContact: string;
  notes: string;
}): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only the admin can change someone's record." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { error: "A name is required." };
  if (!email) return { error: "An email is required." };
  if (!ROLES.includes(input.role as Role)) return { error: "That isn't a valid access level." };
  if (!EMPLOYMENT.includes(input.employment as EmploymentStatus)) return { error: "That isn't a valid status." };
  if (input.employmentType && !EMPLOYMENT_TYPES.includes(input.employmentType)) return { error: "That isn't a valid employment type." };

  // Nobody can strip their own admin access — one misclick would lock the
  // only person who can undo it out of the thing they'd need to undo it.
  if (input.id === actor.id && input.role !== "admin" && actor.role === "admin") {
    return { error: "You can't remove your own admin access." };
  }

  const clash = await prisma.user.findFirst({ where: { email, id: { not: input.id } }, select: { id: true } });
  if (clash) return { error: "Someone else already uses that email." };

  const salary = input.salary.trim() ? Number(input.salary.replace(/[^0-9.]/g, "")) : null;
  if (salary !== null && !Number.isFinite(salary)) return { error: "That salary isn't a number." };

  // the position decides the department (lib/teams), whatever was sent
  const position = input.jobTitleId ? await prisma.jobTitle.findUnique({ where: { id: input.jobTitleId }, select: { teamId: true } }) : null;
  if (input.jobTitleId && !position) return { error: "That position no longer exists." };

  await prisma.user.update({
    where: { id: input.id },
    data: {
      name,
      email,
      phone: input.phone.trim() || null,
      role: input.role as Role,
      teamId: departmentFor(input.role, position?.teamId, input.teamId || null),
      jobTitleId: input.jobTitleId || null,
      joinedAt: day(input.joinedAt),
      salary,
      employment: input.employment as EmploymentStatus,
      employmentType: input.employmentType || null,
      birthday: day(input.birthday),
      emergencyContact: input.emergencyContact.trim() || null,
      notes: input.notes.trim() || null,
    },
  });

  revalidatePath("/team");
  revalidatePath("/finance");
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
  if (!actor) return { error: "Only the admin can add a position." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the position a name." };

  const existing = await prisma.jobTitle.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return { success: true, id: existing.id, name: existing.name, teamId: existing.teamId };
  if (teamId && !(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) return { error: "That department no longer exists." };

  const last = await prisma.jobTitle.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.jobTitle.create({ data: { name: trimmed, teamId, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  return { success: true, id: created.id, name: created.name, teamId: created.teamId };
}

export async function deleteJobTitle(id: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only the admin can remove a position." };

  // Unset it from whoever holds it rather than refusing: the title is a
  // label, and blocking the delete would mean hunting down every holder
  // first. Their access and department are untouched; only the label goes.
  await prisma.user.updateMany({ where: { jobTitleId: id }, data: { jobTitleId: null } });
  await prisma.jobTitle.delete({ where: { id } });
  return { success: true };
}

// A new side of the agency. It works like the others from the start: its
// core members see its work, and its task tags are offered to it.
export async function createDepartment(name: string): Promise<PeopleFormState & { id?: string; name?: string; slug?: string }> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only the admin can add a department." };
  const trimmed = name.trim();
  const slug = slugOf(trimmed);
  if (!slug) return { error: "Give the department a name." };
  // "editors" is how Operations' editors are shown (lib/teams)
  if (slug === "editors") return { error: "Editors are part of Operations. Add an editor position there instead." };

  const clash = await prisma.team.findFirst({ where: { OR: [{ slug }, { name: { equals: trimmed, mode: "insensitive" } }] } });
  if (clash) return { error: `"${clash.name}" already exists.` };

  const last = await prisma.team.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.team.create({ data: { name: trimmed, slug, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  return { success: true, id: created.id, name: created.name, slug: created.slug };
}

// Only an empty department goes: who sits in one decides what they can see,
// so moving people out is a choice made person by person. Operations stays;
// the editing queue and client feedback are built on it. Its positions go
// with it; its task tags become shared by everyone.
export async function deleteDepartment(id: string): Promise<PeopleFormState> {
  const actor = await requirePeopleAdmin();
  if (!actor) return { error: "Only the admin can remove a department." };
  const team = await prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
  if (!team) return { success: true };
  if (team.slug === "operations") return { error: "Operations can't be removed: the editing queue runs on it." };
  if (team._count.members) {
    return { error: `${team.name} still has ${team._count.members} ${team._count.members === 1 ? "person" : "people"}. Move them to another department first.` };
  }

  await prisma.$transaction([
    prisma.taskTag.updateMany({ where: { teamId: id }, data: { teamId: null } }),
    prisma.jobTitle.deleteMany({ where: { teamId: id } }),
    prisma.team.delete({ where: { id } }),
  ]);
  return { success: true };
}
