// The two bits of the Google connection the browser needs: where Google
// sends people back to, and the consent screen's address. Kept out of
// lib/drive.ts because that one talks to the database, which a browser
// bundle can't (and shouldn't) pull in.

export function redirectUri(origin: string) {
  return `${origin}/api/google/callback`;
}

export function consentUrl(clientId: string, origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    access_type: "offline", // so the connection lasts beyond this hour
    prompt: "consent", // and so Google really hands back a lasting one
    include_granted_scopes: "true",
    // Full drive, because client folders are made inside a folder the team
    // already has (their Raw Files). drive.file only reaches what the app
    // itself created, which would force an extra folder of ours in between.
    scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Reading easeus.media@gmail.com's mail — Adobe's emails about contracts
// out for signature (see lib/contractTracking.ts). Read-only, and a separate
// connection from Drive's, so either can be dropped without the other.
export function gmailConsentUrl(clientId: string, origin: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    login_hint: "easeus.media@gmail.com",
    state: "gmail",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
