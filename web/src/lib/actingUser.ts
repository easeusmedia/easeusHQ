// The logged-in session user is always who you actually are. "?as=" only
// lets admin/core preview another person's view — employees can never
// switch, no matter what's in the URL.
export function resolveActingUser<T extends { id: string; role: string }>(
  users: T[],
  sessionUserId: string,
  as: string | undefined
): T | undefined {
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) return undefined;
  if (!as) return sessionUser;
  const canViewAs = sessionUser.role === "admin" || sessionUser.role === "core";
  return canViewAs ? (users.find((u) => u.id === as) ?? sessionUser) : sessionUser;
}
