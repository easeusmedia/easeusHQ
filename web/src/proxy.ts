import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, unsign } from "@/lib/sessionToken";

// A client's page and the team's page share one address: /clients/<name>
// (and /clients/<name>/projects/<id> for one of its projects). Anyone not
// signed in — no session cookie, or one that doesn't check out — is shown
// the client's own read-only view, which lives under /share/<name>; the
// address bar doesn't change. That page checks the client has sharing
// switched on, and sends everyone else to sign in. Signed-in team members
// get the team's page. Links inside the client's view go to /share/…
// directly, so where they lead never depends on this.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && unsign(token)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = url.pathname.replace(/^\/clients\//, "/share/");
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/clients/:slug", "/clients/:slug/projects/:id"],
};
