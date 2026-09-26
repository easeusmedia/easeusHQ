"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOps } from "@/lib/auth";
import { previousRange } from "@/lib/analytics";
import { startSync } from "@/lib/contentSync";

// "Refresh" on the Analytics page: read every client's numbers for this range
// (and the period before, for the comparison) now, rather than waiting for
// the nightly refresh.
export async function refreshAnalytics(from: string, to: string): Promise<{ error?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can refresh this." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : undefined;
  try {
    await startSync({ since: previousRange(from, to).from, origin });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the refresh." };
  }
  revalidatePath("/analytics");
  return {};
}
