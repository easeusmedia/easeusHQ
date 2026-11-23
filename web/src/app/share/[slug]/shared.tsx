import { prisma } from "@/lib/prisma";
import { projectSlugs } from "@/lib/slug";

// What a client's shared pages have in common.

// The client, only while their page is shared.
export async function sharedClient(slug: string) {
  const client = await prisma.client.findUnique({ where: { slug } });
  return client?.shareEnabled ? client : null;
}

// A project on it, by its address (its name, lib/slug projectSlugs) or by
// its id, as the links did before: the id and the address it has now
export async function sharedProject(clientId: string, key: string) {
  const all = await prisma.project.findMany({ where: { clientId }, select: { id: true, name: true, type: true, createdAt: true } });
  const slugs = projectSlugs(all);
  const id = slugs.has(key) ? key : [...slugs].find(([, s]) => s === key)?.[0];
  return id ? { id, slug: slugs.get(id)! } : null;
}
