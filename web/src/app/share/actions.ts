"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkFeedback, FEEDBACK_PER_HOUR } from "@/lib/feedback";

// Sent from a client's shared page — no sign-in, so everything is checked:
// the page must still be shared, the text must pass checkFeedback, and a
// client can't post more than FEEDBACK_PER_HOUR messages in an hour.
export async function sendClientFeedback(
  slug: string,
  input: { name?: unknown; message?: unknown; trap?: unknown }
): Promise<{ error?: string; ok?: boolean }> {
  const client = await prisma.client.findUnique({ where: { slug: String(slug) }, select: { id: true, shareEnabled: true } });
  if (!client?.shareEnabled) return { error: "This page isn't shared any more." };

  const checked = checkFeedback({ name: String(input?.name ?? ""), message: String(input?.message ?? ""), trap: String(input?.trap ?? "") });
  if ("error" in checked) return checked;

  const lastHour = await prisma.clientFeedback.count({
    where: { clientId: client.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (lastHour >= FEEDBACK_PER_HOUR) return { error: "Lots of messages just now — please try again in a little while." };

  await prisma.clientFeedback.create({ data: { clientId: client.id, ...checked } });
  // the team sees it on the client's own page
  revalidatePath("/clients/[slug]", "page");
  return { ok: true };
}
