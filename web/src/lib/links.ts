// Every link field in this app (rawLink, frameioLink, driveLink, and the
// bare-domain matches linkify() finds in free-text notes) eventually ends
// up as an <a href>. Without a check, someone could save "javascript:..."
// or "data:..." as a "link" and have it execute in whoever's browser
// clicks it — that's the actual "malicious link" risk here, not just a
// typo'd URL. This is the one gate all of them go through.
//
// Deliberately NOT checking whether the URL is actually reachable — that
// would mean the server fetching an arbitrary user-supplied URL on every
// save, which is its own risk (SSRF) for a check that's just going to be
// "is drive.google.com up" 99% of the time anyway.
export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null; // not a parseable URL at all
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null; // "https://foo" isn't a real domain
  return url.toString();
}
