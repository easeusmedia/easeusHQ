// deterministic initials + color for a name, so avatars stay stable without storing them
const COLORS = ["#f2c14e", "#6ea8fe", "#a78bfa", "#4ade80", "#f97066", "#5eead4"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function colorFor(name: string): string {
  const hash = [...name].reduce((h, c) => h + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}
