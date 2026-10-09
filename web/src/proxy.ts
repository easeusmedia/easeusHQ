import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, COOKIE_OPTIONS, unsign } from "@/lib/sessionToken";

// A client's page and the team's page share one address: /clients/<name>
// (and /clients/<name>/projects/<id> for one of its projects). Anyone not
// signed in — no session cookie, or one that doesn't check out — is shown
// the client's own read-only view, which lives under /share/<name>; the
// address bar doesn't change. That page checks the client has sharing
// switched on, and sends everyone else to sign in. Signed-in team members
// get the team's page. Links inside the client's view go to /share/…
// directly, so where they lead never depends on this.
//
// And every page opened signed in renews the sign-in, so it lasts 30 days
// from the last visit rather than the first.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const signedIn = !!token && !!unsign(token);
  if (!signedIn && /^\/clients\/[^/]+(\/projects\/[^/]+)?$/.test(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace(/^\/clients\//, "/share/");
    return NextResponse.rewrite(url);
  }
  const res = NextResponse.next();
  // only on opening a page: never on an action, so signing out stays out
  if (signedIn && request.method === "GET") res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  return res;
}

export const config = {
  matcher: [
    "/clients/:slug",
    "/clients/:slug/projects/:id",
    // a page opened, not the app's own fetches between pages, its files or its API
    {
      source: "/((?!api/|_next/|.*\\..*).*)",
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-action" },
      ],
    },
  ],
};
