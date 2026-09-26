import { NextResponse } from "next/server";
import { requireOps } from "@/lib/auth";
import { connectInstagram } from "@/lib/instagram";
import { backToClient, finishState } from "@/lib/socialConnect";

// Where Instagram sends ops back after a client's account is approved.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await requireOps())) return NextResponse.redirect(new URL("/login", url.origin));
  const clientId = await finishState(url.searchParams.get("state"), "ig");
  if (!clientId) return NextResponse.redirect(new URL("/clients", url.origin));

  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) {
    return NextResponse.redirect(await backToClient(url.origin, clientId, "instagram", denied ?? "Instagram didn't send a code back."));
  }
  try {
    // Instagram adds "#_" to the code
    await connectInstagram(clientId, code.replace(/#_$/, ""), url.origin);
    return NextResponse.redirect(await backToClient(url.origin, clientId, "instagram"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't finish connecting.";
    return NextResponse.redirect(await backToClient(url.origin, clientId, "instagram", message));
  }
}
