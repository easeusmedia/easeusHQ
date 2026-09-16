// A client's name as it appears in its address: "Elle Sera" → /clients/elle-sera.

// Names that are already pages under /clients, so a client can't take them.
const RESERVED = new Set(["template"]);

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents off: "Café" → "cafe"
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

export const clientHref = (c: { id: string; slug: string | null }) => `/clients/${c.slug ?? c.id}`;
