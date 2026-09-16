import { NextResponse, type NextRequest } from "next/server";

// A client's page and the team's page share one address: /clients/<name>
// (and /clients/<name>/projects/<id> for one of its projects). Anyone not
// signed in (no session cookie) is shown the client's own read-only view,
// which lives under /share/<name>; the address bar doesn't change. That page checks the client has sharing switched on, and sends
// everyone else to sign in. Signed-in team members never reach this.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = url.pathname.replace(/^\/clients\//, "/share/");
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    { source: "/clients/:slug", missing: [{ type: "cookie", key: "session" }] },
    { source: "/clients/:slug/projects/:id", missing: [{ type: "cookie", key: "session" }] },
  ],
};
