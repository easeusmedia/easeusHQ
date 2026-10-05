import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isFounder, type Viewer } from "@/lib/scope";

// Admin & Technical only holds who handles what behind the scenes (Tech
// Support, File Management, Operations): it is managed under Employees and
// never shown as a department of its own
export const BACKSTAGE = ["admin-technical"];

// Every department shown under Organization, in order: asked once per
// request (the frame and the page both need it)
export const allDepartments = cache(() =>
  prisma.team.findMany({ where: { slug: { notIn: BACKSTAGE } }, select: { id: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } })
);

// The departments someone may open under Organization: Level 1 all of
// them, everyone else the ones they're in
export async function visibleDepartments(viewer: Viewer) {
  const all = await allDepartments();
  return isFounder(viewer) ? all : all.filter((t) => viewer.departments.some((d) => d.id === t.id));
}
