import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ashmit = await prisma.user.upsert({
    where: { email: "ashmitshahi0918@gmail.com" },
    update: {},
    create: { name: "Ashmit Sahi", email: "ashmitshahi0918@gmail.com", role: "admin" },
  });

  const [rounak, narendra, sparsh] = await Promise.all([
    prisma.user.upsert({
      where: { email: "rounak@example.com" },
      update: {},
      create: { name: "Rounak Jangid", email: "rounak@example.com", role: "employee" },
    }),
    prisma.user.upsert({
      where: { email: "narendra@example.com" },
      update: {},
      create: { name: "Narendra Mehta", email: "narendra@example.com", role: "employee" },
    }),
    prisma.user.upsert({
      where: { email: "sparsh@example.com" },
      update: {},
      create: { name: "Sparsh", email: "sparsh@example.com", role: "employee" },
    }),
  ]);

  // The core/ops team — alongside Ashmit (admin), they run the queue day to
  // day: assign tasks, request revisions, mark deliveries. This account was
  // previously mislabeled "AK Raj" (guessed off the email) — it's Abhishek.
  const [abhishek, jyotsna, arpit] = await Promise.all([
    prisma.user.upsert({
      where: { email: "akraj618@gmail.com" },
      update: { name: "Abhishek", role: "core" },
      create: { name: "Abhishek", email: "akraj618@gmail.com", role: "core" },
    }),
    // placeholder email — replace once we have the real one
    prisma.user.upsert({
      where: { email: "jyotsna@example.com" },
      update: {},
      create: { name: "Jyotsna", email: "jyotsna@example.com", role: "core" },
    }),
    // placeholder email — replace once we have the real one
    prisma.user.upsert({
      where: { email: "arpit@example.com" },
      update: {},
      create: { name: "Arpit", email: "arpit@example.com", role: "core" },
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
