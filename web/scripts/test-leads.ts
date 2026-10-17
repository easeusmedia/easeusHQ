// Three leads to try the outreach window with, on the local database only:
//   node --env-file=.env scripts/run.cjs scripts/test-leads.ts
// Each run removes the previous "Test ·" leads first, so it can be run again.
import { prisma } from "@/lib/prisma";
import type { Contact } from "@/lib/space";

const BOARD = "dream-156-podcasts-core-offer";
const ch = (kind: Contact["channels"][number]["kind"], value: string) => ({ kind, value });
const person = (id: string, name: string, role: string, ...channels: Contact["channels"]): Contact => ({ id, name, role, channels });

const LEADS: { title: string; stage: string; path: string[]; contacts: Contact[] }[] = [
  {
    // two people, different reach: Priya's Day 1 is the email, Rohan's the LinkedIn note (no email)
    title: "Test · Two people on Day 1",
    stage: "Day 1",
    path: ["Ready to reach out", "Day 1"],
    contacts: [
      person("c1", "Priya Nair", "Host", ch("email", "priya@example.com"), ch("linkedin", "https://linkedin.com/in/priyanair")),
      person("c2", "Rohan Mehta", "Producer", ch("linkedin", "https://linkedin.com/in/rohanmehta")),
    ],
  },
  {
    // Day 2 is Instagram: Dev has none, so his row is greyed
    title: "Test · One without Instagram",
    stage: "Day 2 · Instagram 1",
    path: ["Ready to reach out", "Day 1", "Day 2 · Instagram 1"],
    contacts: [
      person("c1", "Aisha Khan", "Host", ch("email", "aisha@example.com"), ch("instagram", "@aishakhan"), ch("linkedin", "https://linkedin.com/in/aishakhan")),
      person("c2", "Dev Sharma", "Co-host", ch("email", "dev@example.com")),
    ],
  },
  {
    // the whole run ahead, one person with every handle
    title: "Test · Full run ahead",
    stage: "Ready to reach out",
    path: ["Ready to reach out"],
    contacts: [person("c1", "Meera Iyer", "Founder", ch("email", "meera@example.com"), ch("instagram", "@meeraiyer"), ch("linkedin", "https://linkedin.com/in/meeraiyer"))],
  },
];

async function main() {
  const board = await prisma.space.findFirst({ where: { slug: BOARD }, select: { id: true, name: true, stages: { select: { id: true, name: true } }, fields: { where: { kind: "contacts" }, select: { id: true } } } });
  if (!board) throw new Error(`No board ${BOARD}`);
  const field = board.fields[0]?.id;
  if (!field) throw new Error("The board has no contacts field");
  const who = await prisma.user.findFirstOrThrow({ where: { email: "abhishek@easeus.media" }, select: { id: true, name: true } });
  const stageOf = (name: string) => {
    const s = board.stages.find((x) => x.name === name);
    if (!s) throw new Error(`No stage ${name}`);
    return s;
  };

  const gone = await prisma.lead.deleteMany({ where: { boardId: board.id, title: { startsWith: "Test · " } } });
  if (gone.count) console.log(`Removed ${gone.count} earlier test lead(s)`);

  for (const [i, l] of LEADS.entries()) {
    const stage = stageOf(l.stage);
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const lead = await prisma.lead.create({
      data: { boardId: board.id, stageId: stage.id, title: l.title, values: { [field]: l.contacts }, sortOrder: Date.now() + i, createdById: who.id, assignedToId: who.id, assignedByName: who.name, assignedAt: new Date(), stageSince: at(60 * l.path.length) },
      select: { id: true },
    });
    // its record: made in the first stage, then moved on day by day
    const events = l.path.map((name, j) => ({
      leadId: lead.id,
      kind: j === 0 ? "created" : "moved",
      summary: j === 0 ? `Created in ${name}` : `Moved to ${name}`,
      fromStage: j === 0 ? null : l.path[j - 1],
      toStage: name,
      byId: who.id,
      byName: who.name,
      createdAt: at(60 * (l.path.length - j) * 24),
    }));
    await prisma.leadEvent.createMany({ data: events });
    console.log(`${l.title}  →  ${l.stage}  (${l.contacts.map((c) => c.name).join(", ")})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
