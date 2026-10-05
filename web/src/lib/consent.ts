// The cookie choice someone made on the notice (see CookieNotice): "all" also
// lets the app remember preferences, like whether the sidebar is open;
// "essential" keeps only what signing in and security need.
export const CONSENT_COOKIE = "cookie-consent";
// the look picked last (Mist or Dark), so the sign-in page opens in it: a
// preference, so kept only with "all"
export const THEME_COOKIE = "theme";
export type Consent = "all" | "essential";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )cookie-consent=(all|essential)/);
  return (m?.[1] as Consent) ?? null;
}

export function saveConsent(c: Consent) {
  document.cookie = `${CONSENT_COOKIE}=${c}; path=/; max-age=31536000; samesite=lax`;
}

// Remember the look picked, when preferences may be kept
export function saveTheme(theme: "dark" | "mist") {
  if (readConsent() === "all") document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
