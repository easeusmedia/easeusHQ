import { prisma } from "@/lib/prisma";
const recent = await prisma.client.findMany({
  orderBy: { createdAt: "desc" }, take: 3,
  select: { name: true, slug: true, niche: true, email: true, whatsapp: true, avatarUrl: true, socialLinks: true, driveFolderUrl: true, notes: true, createdAt: true },
});
for (const c of recent) {
  console.log(`${c.name} (${c.slug}) created ${c.createdAt.toISOString().slice(0,16)}`);
  console.log(`   niche=${c.niche} email=${c.email} whatsapp=${c.whatsapp} logo=${c.avatarUrl ? "yes" : "no"}`);
  console.log(`   socials=${JSON.stringify(c.socialLinks)}`);
  console.log(`   drive=${c.driveFolderUrl ?? "none"}`);
  if (c.notes) console.log(`   notes=${c.notes}`);
}
console.log("unused invites:", await prisma.clientInvite.count({ where: { usedAt: null } }));
await prisma.$disconnect();
