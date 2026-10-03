import { createHash } from "crypto";

// Pictures stored in the database (client logos, people's photos) are data:
// URIs. Pages never carry the picture itself — every page refreshes itself
// every few seconds — only its address, served from a small route. The ?v=
// is a hash of the picture, so a new upload is a new address and the browser
// can keep each version cached for good.

// md5, cut short: the same value the database gives for a stored picture
// (lib/pictureVersions.ts), so a picture has one address wherever it's built
function version(data: string): string {
  return createHash("md5").update(data).digest("hex").slice(0, 10);
}

// The same addresses from a version already in hand: lists ask the database
// for each picture's short hash, so the picture itself never leaves it
export const logoSrcAt = (slug: string, v: string | null | undefined): string | null => (v ? `/clients/${slug}/logo?v=${v}` : null);
export const photoSrcAt = (id: string, v: string | null | undefined): string | null => (v ? `/team/${id}/photo?v=${v}` : null);

export function clientLogoSrc(c: { slug: string; avatarUrl: string | null }): string | null {
  return logoSrcAt(c.slug, c.avatarUrl && version(c.avatarUrl));
}

export function userPhotoSrc(u: { id: string; avatarUrl: string | null }): string | null {
  return photoSrcAt(u.id, u.avatarUrl && version(u.avatarUrl));
}

// What an upload may be: a small JPEG, PNG or WebP (the browser resizes it
// first — see imageResize.ts).
export function isStorablePicture(dataUrl: string): boolean {
  return dataUrl.length <= 300_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl);
}

// The bytes and type of a stored picture, for the routes that serve them —
// images only, so nothing stored can ever be served as a page.
export function decodePicture(dataUrl: string | null | undefined): { type: string; bytes: Buffer } | null {
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}
