// Sales > Leads (Abhishek, 3 Nov 2026): the page where the team collects the
// leads it finds, one spreadsheet tab per type, first among Sales' pages;
// and Sales > Outreach, one page holding the outreach portals (Podcast,
// Doctors) that sat on Sales itself.
//   node --env-file=.env scripts/run.cjs scripts/leads-setup.ts [--live]
// Runs again safely: a page or tab already there is left as it is.
import "./live";
import { prisma } from "@/lib/prisma";
import { DEAD_STAGE, makeSheet } from "@/lib/leadSheet";
import { uniqueSlug } from "@/lib/space";

const TABS = ["Podcast", "Doctors"];

async function main() {
  const sales = await prisma.team.findFirst({ where: { slug: "sales" }, select: { id: true } });
  if (!sales) throw new Error("There's no Sales department.");
  const top = await prisma.space.findMany({ where: { teamId: sales.id, parentId: null }, select: { id: true, name: true, slug: true, sortOrder: true, leadBank: true } });
  let page = top.find((s) => s.leadBank);
  if (!page) {
    if (top.some((s) => s.name.toLowerCase() === "leads")) throw new Error('Sales already has a page called "Leads" that isn\'t the lead bank.');
    page = await prisma.space.create({
      data: { teamId: sales.id, parentId: null, kind: "portal", name: "Leads", slug: uniqueSlug("Leads", top.map((s) => s.slug)), sortOrder: Math.min(1, ...top.map((s) => s.sortOrder)) - 1, leadBank: true },
      select: { id: true, name: true, slug: true, sortOrder: true, leadBank: true },
    });
    console.log("Made Sales > Leads.");
  }
  const tabs = await prisma.space.findMany({ where: { parentId: page.id }, select: { id: true, name: true, slug: true, stages: { select: { name: true, sortOrder: true } } } });
  // tabs made before Dead leads (3 Nov 2026) get its stage
  for (const t of tabs.filter((t) => !t.stages.some((s) => s.name === DEAD_STAGE))) {
    await prisma.boardStage.create({ data: { boardId: t.id, name: DEAD_STAGE, color: "red", sortOrder: Math.max(0, ...t.stages.map((s) => s.sortOrder)) + 1 } });
    console.log(`Gave ${t.name} its Dead leads.`);
  }
  for (const [i, name] of TABS.entries()) {
    if (tabs.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;
    await prisma.$transaction(async (tx) => {
      const tab = await tx.space.create({ data: { teamId: sales.id, parentId: page.id, kind: "board", name, slug: uniqueSlug(name, tabs.map((t) => t.slug)), sortOrder: i + 1 } });
      await makeSheet(tx, tab.id);
    });
    console.log(`Made the ${name} tab.`);
  }
  // the outreach portals (every one on Sales itself but Leads) into Outreach
  const loose = await prisma.space.findMany({ where: { teamId: sales.id, parentId: null, kind: "portal", leadBank: false }, select: { id: true, name: true, slug: true } });
  let outreach = await prisma.space.findFirst({ where: { teamId: sales.id, parentId: null, kind: "section", name: "Outreach" }, select: { id: true } });
  if (loose.length && !outreach) {
    const taken = (await prisma.space.findMany({ where: { teamId: sales.id, parentId: null }, select: { slug: true } })).map((s) => s.slug);
    outreach = await prisma.space.create({ data: { teamId: sales.id, parentId: null, kind: "section", name: "Outreach", slug: uniqueSlug("Outreach", taken), sortOrder: page.sortOrder + 1 }, select: { id: true } });
    console.log("Made Sales > Outreach.");
  }
  if (outreach) {
    const inside = (await prisma.space.findMany({ where: { parentId: outreach.id }, select: { slug: true } })).map((s) => s.slug);
    for (const p of loose) {
      if (inside.includes(p.slug)) throw new Error(`Outreach already has a page at "${p.slug}".`);
      await prisma.space.update({ where: { id: p.id }, data: { parentId: outreach.id } });
      inside.push(p.slug);
      console.log(`Moved ${p.name} into Outreach.`);
    }
  }
  console.log("Done.");
}
main().finally(() => prisma.$disconnect());
