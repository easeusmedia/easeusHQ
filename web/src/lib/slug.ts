// A client's name as it appears in its address: "Elle Sera" → /clients/elle-sera.

// Names that are already pages under /clients, so a client can't take them.
const RESERVED = new Set(["template"]);

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents off: "Café" → "cafe"
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "client";
}

// The first free version of `base`: base, base-2, base-3…
export function firstFree(base: string, taken: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug) || RESERVED.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export const clientHref = (c: { slug: string }) => `/clients/${c.slug}`;

// Each project's name as its address on the client's shared page
// (/share/courageous-leaders/projects/matt-porter; Abhishek, 23 Nov 2026),
// one per project: of two alike, the older keeps the plain name
export function projectSlugs(projects: { id: string; name: string | null; type: string; createdAt: Date }[]): Map<string, string> {
  const taken = new Set<string>();
  const slugs = new Map<string, string>();
  for (const p of [...projects].sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id))) {
    const slug = firstFree(slugify(p.name || p.type), taken);
    taken.add(slug);
    slugs.set(p.id, slug);
  }
  return slugs;
}
