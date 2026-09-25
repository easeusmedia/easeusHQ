import { SCOPES } from "./frameio";

// The browser's half of the Frame.io connection: where Adobe sends people
// back to, and the consent screen's address. Separate from lib/frameio.ts
// for the same reason driveClient is separate from drive — that one reaches
// the database, which a browser bundle can't.

export function frameioRedirectUri(origin: string) {
  return `${origin}/api/frameio/callback`;
}

export function frameioConsentUrl(clientId: string, origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: frameioRedirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `https://ims-na1.adobelogin.com/ims/authorize/v2?${params}`;
}
