import { NextResponse } from "next/server";
import { getThreadMessages } from "@/app/(workspace)/presence/actions";

export const dynamic = "force-dynamic";

// One conversation, for the open chat to poll — a GET, so it never queues
// ahead of a click the way a server action does (see api/pulse).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await getThreadMessages(id), { headers: { "Cache-Control": "no-store" } });
}
