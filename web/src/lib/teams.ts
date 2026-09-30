// Which department a person is shown under: their own. (Editors used to be
// filed under Operations and shown as "Editors"; they're in Production now.)
export function displayTeam<T extends { slug: string; name: string }>(person: { role: string; team: T | null }): T | null {
  return person.team;
}

// How someone is employed — a label, not access; saved as the key.
export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  freelance: "Freelance",
  intern: "Intern",
};

// Which department someone sits in. Their position decides it when the
// position belongs to one ("Video editor" is Operations). An admin
// otherwise spans the whole company, so has none (null); anyone else keeps
// the department picked for them.
export function departmentFor(role: string, positionDepartment: string | null | undefined, picked: string | null): string | null {
  if (positionDepartment) return positionDepartment;
  if (role === "admin") return null;
  return picked || null;
}

// A department's address, from its name: "Post production" → "post-production"
export function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
