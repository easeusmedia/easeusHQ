// Abhishek (the developer) always has whatever an admin has — "viewing as",
// permanently deleting history rows, anything else gated this way. If that
// ever needs to change (Abhishek's access gets scoped down to a normal core
// member), narrow this one check rather than hunting down every call site.
export function isAbhishekOrAdmin(user: { role: string; email: string }): boolean {
  return user.role === "admin" || user.email === "abhishek@easeus.media";
}

// The logged-in session user is always who you actually are. "?as=" only
// lets Abhishek or an admin preview another person's view — everyone else,
// including other core members, can never switch, no matter what's in the
// URL.
export function resolveActingUser<T extends { id: string; role: string; email: string }>(
  users: T[],
  sessionUserId: string,
  as: string | undefined
): T | undefined {
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) return undefined;
  if (!as) return sessionUser;
  return isAbhishekOrAdmin(sessionUser) ? (users.find((u) => u.id === as) ?? sessionUser) : sessionUser;
}
