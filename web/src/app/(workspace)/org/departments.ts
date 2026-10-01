import { prisma } from "@/lib/prisma";
import { isFounder, type Viewer } from "@/lib/scope";

// The departments someone may open under Organization: Level 1 all of
// them, everyone else the ones they're in
export async function visibleDepartments(viewer: Viewer) {
  const all = await prisma.team.findMany({ select: { id: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } });
  return isFounder(viewer) ? all : all.filter((t) => viewer.departments.some((d) => d.id === t.id));
}
