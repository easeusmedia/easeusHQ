import "./live";
import { prisma } from "../src/lib/prisma";
// Shortlisted out of every Sales board (17 Oct 2026, Abhishek: not used),
// to the bin as the app's own Delete stage does; only an empty one.
//   node --env-file=.env scripts/run.cjs scripts/_shortlist.ts [--live]
const me = await prisma.user.findUniqueOrThrow({ where: { email: "abhishek@easeus.media" }, select: { id: true, name: true } });
const stages = await prisma.boardStage.findMany({ where: { name: "Shortlisted", board: { team: { slug: "sales" } } }, select: { id: true, name: true, color: true, sortOrder: true, boardId: true, board: { select: { name: true, teamId: true } }, _count: { select: { leads: true, messages: true } } } });
for (const s of stages) {
  if (s._count.leads) { console.log(`${s.board.name}: Shortlisted has ${s._count.leads} leads, left alone`); continue; }
  await prisma.$transaction([
    prisma.spaceTrash.create({ data: { teamId: s.board.teamId, spaceId: s.boardId, kind: "stage", title: s.name, data: { name: s.name, color: s.color, sortOrder: s.sortOrder }, reason: "Not used: removed from every Sales board (Abhishek, 17 Oct 2026)", byId: me.id, byName: me.name } }),
    prisma.boardStage.delete({ where: { id: s.id } }),
  ]);
  console.log(`${s.board.name}: Shortlisted removed (${s._count.messages} messages)`);
}
await prisma.$disconnect();
