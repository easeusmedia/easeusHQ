// The cookie choice someone made on the notice (see CookieNotice): "all" also
// lets the app remember preferences, like whether the sidebar is open;
// "essential" keeps only what signing in and security need.
export const CONSENT_COOKIE = "cookie-consent";
export type Consent = "all" | "essential";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )cookie-consent=(all|essential)/);
  return (m?.[1] as Consent) ?? null;
}

export function saveConsent(c: Consent) {
  document.cookie = `${CONSENT_COOKIE}=${c}; path=/; max-age=31536000; samesite=lax`;
}
