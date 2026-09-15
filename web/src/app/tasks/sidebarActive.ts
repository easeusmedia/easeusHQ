// Sub-pages that belong to a nav item without living under its path. A
// project is reached from a client and sits inside that client's world, so
// Clients stays lit while you're on one.
const ALSO_UNDER: Record<string, string[]> = { "/clients": ["/projects"] };

// Board's segment is "" — i.e. /tasks itself, which is a prefix of every
// other route here — so it's the one item that has to match exactly.
// Everything else lights up for its own sub-pages too: matching only the
// exact path meant opening a client left nothing in the nav highlighted, so
// the sidebar stopped telling you where you were the moment you went one
// level deep.
//
// Matching on a trailing "/" rather than a bare prefix keeps /tasks/my from
// claiming a hypothetical /tasks/my-notes.
export function isActive(segment: string, pathname: string, base: string): boolean {
  if (segment === "") return pathname === base;
  return [segment, ...(ALSO_UNDER[segment] ?? [])].some(
    (s) => pathname === `${base}${s}` || pathname.startsWith(`${base}${s}/`)
  );
}
