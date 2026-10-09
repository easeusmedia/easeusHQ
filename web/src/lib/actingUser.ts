import { isFounder } from "./scope.ts";

// Level 1's check by its older name: an admin, or Abhishek (the developer) in
// developer mode only (lib/scope isFounder). On the live site he's Level 2.
export function isAbhishekOrAdmin(user: { role: string; email: string }): boolean {
  return isFounder(user);
}
