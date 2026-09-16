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

// A client's logo as an ordinary cached image rather than the image itself
// inlined into every page: the stored logo is a data: URI, and pages refresh
// themselves every few seconds. The version is a short hash of the logo, so
// a new upload is a new address and the browser can keep the old one cached
// for good.
export function clientLogoSrc(c: { slug: string; avatarUrl: string | null }): string | null {
  if (!c.avatarUrl) return null;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < c.avatarUrl.length; i++) h = Math.imul(h ^ c.avatarUrl.charCodeAt(i), 16777619);
  return `/clients/${c.slug}/logo?v=${(h >>> 0).toString(36)}`;
}
