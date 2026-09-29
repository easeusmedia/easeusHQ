// Abhishek (the developer) always has whatever an admin has: permanently
// deleting history rows, the Integrations page, anything else gated this
// way. If that ever needs to change (Abhishek's access gets scoped down to a
// normal core member), narrow this one check rather than hunting down every
// call site.
export function isAbhishekOrAdmin(user: { role: string; email: string }): boolean {
  return user.role === "admin" || user.email === "abhishek@easeus.media";
}
