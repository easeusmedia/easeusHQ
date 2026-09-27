import { prisma } from "@/lib/prisma";

// What a client's shared pages have in common.

// The client, only while their page is shared.
export async function sharedClient(slug: string) {
  const client = await prisma.client.findUnique({ where: { slug } });
  return client?.shareEnabled ? client : null;
}
