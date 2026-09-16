// Sub-pages that belong to a nav item without living under its path. A
// project is reached from a client and sits inside that client's world, so
// Clients stays lit while you're on one.
const ALSO_UNDER: Record<string, string[]> = { "/clients": ["/projects"] };

// A nav item lights up on its own page and everything under it: matching
// only the exact path meant opening a client left nothing in the nav
// highlighted, so the sidebar stopped telling you where you were the moment
// you went one level deep.
//
// Matching on a trailing "/" rather than a bare prefix keeps /chat from
// claiming a hypothetical /chatter.
export function isActive(href: string, pathname: string): boolean {
  return [href, ...(ALSO_UNDER[href] ?? [])].some((s) => pathname === s || pathname.startsWith(`${s}/`));
}
