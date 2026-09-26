import { NextResponse } from "next/server";
import { callbackKeyMatches, collect } from "@/lib/contentSync";

// Apify calls this when a scrape finishes, so its results are saved at once
// (see lib/contentSync.ts). The key in the address is ours, made the first
// time a scrape was started; without it nothing happens.
export const maxDuration = 60;

async function handle(request: Request) {
  if (!(await callbackKeyMatches(new URL(request.url).searchParams.get("key")))) {
    return NextResponse.json({ error: "Not ours." }, { status: 403 });
  }
  return NextResponse.json(await collect());
}

export const POST = handle;
export const GET = handle;
