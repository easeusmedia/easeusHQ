// Pictures stored in the database (client logos, people's photos) are data:
// URIs. Pages never carry the picture itself — every page refreshes itself
// every few seconds — only its address, served from a small route. The ?v=
// is a hash of the picture, so a new upload is a new address and the browser
// can keep each version cached for good.

function version(data: string): string {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function clientLogoSrc(c: { slug: string; avatarUrl: string | null }): string | null {
  return c.avatarUrl ? `/clients/${c.slug}/logo?v=${version(c.avatarUrl)}` : null;
}

export function userPhotoSrc(u: { id: string; avatarUrl: string | null }): string | null {
  return u.avatarUrl ? `/team/${u.id}/photo?v=${version(u.avatarUrl)}` : null;
}

// What an upload may be: a small JPEG, PNG or WebP (the browser resizes it
// first — see imageResize.ts).
export function isStorablePicture(dataUrl: string): boolean {
  return dataUrl.length <= 300_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl);
}

// The bytes and type of a stored picture, for the routes that serve them.
export function decodePicture(dataUrl: string | null | undefined): { type: string; bytes: Buffer } | null {
  const m = dataUrl?.match(/^data:([^;,]+);base64,(.+)$/);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}
