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
// out for signature (see lib/contractTracking.ts) — and sending from it the
// acknowledgement a client gets after the contract form (lib/contractAck.ts).
// A separate connection from Drive's, so either can be dropped without the
// other. The sales inbox reads only (state "sales-gmail"), for replies and
// response times (lib/mailSync.ts).
export function gmailConsentUrl(clientId: string, origin: string, inbox: "contracts" | "sales" = "contracts") {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: `https://www.googleapis.com/auth/gmail.readonly${inbox === "contracts" ? " https://www.googleapis.com/auth/gmail.send" : ""} https://www.googleapis.com/auth/userinfo.email`,
    login_hint: inbox === "sales" ? "sales.easeus.media@gmail.com" : "easeus.media@gmail.com",
    state: inbox === "sales" ? "sales-gmail" : "gmail",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// easeus.media@gmail.com's calendar: reading its meetings for Home, and
// adding the ones made there (with a Meet link and invites). Events only,
// never the calendar's settings or sharing.
export function calendarConsentUrl(clientId: string, origin: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
    login_hint: "easeus.media@gmail.com",
    state: "calendar",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
