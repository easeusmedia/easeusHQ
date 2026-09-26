// Which team a person is *shown* under.
//
// Editors sit in the Operations team in the data, and that's deliberate:
// team is what access is built on (lib/scope — a core member sees their own
// team's work), and the Operations core — Arpit, Abhishek, Jyotsna — oversee
// the editors' work, as does the Notion mirroring. But the editors aren't
// Operations, and neither is the admin, who runs the place rather than
// working a team's queue.
//
// So wherever people are grouped or filtered by team for *display* — the
// Board's work tabs, History by team, the people directory — an Operations
// editor appears under "Editors" and the admin under no team. Access is
// untouched.
export const EDITORS_TEAM = { slug: "editors", name: "Editors" } as const;

export function displayTeam<T extends { slug: string; name: string }>(person: {
  role: string;
  team: T | null;
}): T | typeof EDITORS_TEAM | null {
  if (person.team?.slug !== "operations") return person.team;
  if (person.role === "employee") return EDITORS_TEAM;
  if (person.role === "admin") return null;
  return person.team;
}
