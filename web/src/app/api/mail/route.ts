import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { onStaff } from "@/lib/users";
import { keyOwner, recordSelfView, recordSent } from "@/lib/mailTrack";

export const dynamic = "force-dynamic";

// What the mail tracker extension reports, with its person's key:
// { kind: "sent", id, from, to, subject, links } as an email goes out, and
// { kind: "self", id } when the sender is looking at it themselves.
export async function POST(request: Request) {
  const userId = keyOwner(request.headers.get("x-tracker-key"));
  // a key stops working once its person leaves
  const person = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { employment: true } }) : null;
  if (!userId || !person || !onStaff(person)) return NextResponse.json({ error: "Connect the tracker again from the app." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.kind === "sent") {
    const error = await recordSent(userId, body);
    return NextResponse.json(error ? { error } : { ok: true }, { status: error ? 400 : 200 });
  }
  if (body?.kind === "self" && typeof body.id === "string") {
    await recordSelfView(body.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
}
