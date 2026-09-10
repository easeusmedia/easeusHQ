import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";

const prisma = new PrismaClient();

// Shared password so login can actually be tested right away — everyone
// should get their own once there's a "change password" UI.
const TEMP_PASSWORD = "Createbetter0305*";
const passwordHash = hashPassword(TEMP_PASSWORD);

async function main() {
  // matched by the OLD email (real gmail / @example.com placeholders) so
  // the upsert renames the existing row instead of creating a duplicate
  const ashmit = await prisma.user.upsert({
    where: { email: "ashmitshahi0918@gmail.com" },
    update: { email: "ashmit@easeus.media", passwordHash },
    create: { name: "Ashmit Sahi", email: "ashmit@easeus.media", role: "admin", passwordHash },
  });

  const [rounak, narendra, sparsh] = await Promise.all([
    prisma.user.upsert({
      where: { email: "rounak@example.com" },
      update: { email: "rounak@easeus.media", passwordHash },
      create: { name: "Rounak Jangid", email: "rounak@easeus.media", role: "employee", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "narendra@example.com" },
      update: { email: "narendra@easeus.media", passwordHash },
      create: { name: "Narendra Mehta", email: "narendra@easeus.media", role: "employee", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "sparsh@example.com" },
      update: { email: "sparsh@easeus.media", passwordHash },
      create: { name: "Sparsh", email: "sparsh@easeus.media", role: "employee", passwordHash },
    }),
  ]);

  // The core/ops team — alongside Ashmit (admin), they run the queue day to
  // day: assign tasks, request revisions, mark deliveries. This account was
  // previously mislabeled "AK Raj" (guessed off the email) — it's Abhishek.
  const [abhishek, jyotsna, arpit] = await Promise.all([
    prisma.user.upsert({
      where: { email: "akraj618@gmail.com" },
      update: { name: "Abhishek", email: "abhishek@easeus.media", role: "core", passwordHash },
      create: { name: "Abhishek", email: "abhishek@easeus.media", role: "core", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "jyotsna@example.com" },
      update: { email: "jyotsna@easeus.media", passwordHash },
      create: { name: "Jyotsna", email: "jyotsna@easeus.media", role: "core", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "arpit@example.com" },
      update: { email: "arpit@easeus.media", passwordHash },
      create: { name: "Arpit", email: "arpit@easeus.media", role: "core", passwordHash },
    }),
  ]);

  // real active ("Current" status) clients, pulled from the Notion Clients
  // Dashboard export — everything there is Subscription engagement
  const activeClients = [
    { id: "client-courageous-leaders", name: "Courageous Leaders", niche: "Podcast / leadership", projectType: "podcast" },
    { id: "client-dr-tego", name: "Dr Tego", niche: "Doctor personal brand", projectType: "reels" },
    { id: "client-elle-sera", name: "Elle Sera", niche: "Personal brand (health)", projectType: "short-form" },
    { id: "client-neelkamal-tmt", name: "Neelkamal TMT", niche: "Corporate (steel/TMT)", projectType: "short-form" },
    { id: "client-robyn", name: "Robyn", niche: "YouTube channel management", projectType: "long-form + shorts" },
  ];

  const projects = await Promise.all(
    activeClients.map(async (c) => {
      const client = await prisma.client.upsert({
        where: { id: c.id },
        update: {},
        create: { id: c.id, name: c.name, niche: c.niche, status: "current" },
      });
      return prisma.project.upsert({
        where: { id: `project-${c.id}` },
        update: {},
        create: { id: `project-${c.id}`, clientId: client.id, type: c.projectType, engagement: "subscription" },
      });
    })
  );
  const [courageousLeaders, drTego, elleSera, neelkamalTMT, robyn] = projects;

  // upsert (not createMany) so re-running the seed doesn't pile up duplicates
  const sampleTasks = [
    { id: "task-ep12-trailer", projectId: courageousLeaders.id, title: "Episode 12 trailer", assignedToId: rounak.id, status: "sent_for_approval" as const, frameioLink: "https://f.io/Nyyjv5qk" },
    { id: "task-ep12-shortform", projectId: courageousLeaders.id, title: "Episode 12 short-form clips", assignedToId: rounak.id, status: "queued" as const },
    { id: "task-skincare-myth-4", projectId: drTego.id, title: "Reel — Skincare myth #4", assignedToId: narendra.id, status: "editing" as const },
    { id: "task-elle-sera-exosomes", projectId: elleSera.id, title: "Elle Sera - Exosomes", assignedToId: rounak.id, status: "sent_for_approval" as const, frameioLink: "https://f.io/6GG2fxZF" },
    { id: "task-sept-promo-cut", projectId: neelkamalTMT.id, title: "September promo cut", assignedToId: sparsh.id, status: "revision_requested" as const, reviewNotes: "Trim the intro, tighten pacing after 0:45" },
    { id: "task-robyn-main-edit", projectId: robyn.id, title: "Robyn — Main YT video edit", assignedToId: narendra.id, status: "final_export_ready" as const },
  ];
  await Promise.all(
    sampleTasks.map(({ id, ...data }) => prisma.task.upsert({ where: { id }, update: {}, create: { id, ...data } }))
  );

  console.log(`Seeded users: ${[ashmit, abhishek, jyotsna, arpit, rounak, narendra, sparsh].map((u) => u.name).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
