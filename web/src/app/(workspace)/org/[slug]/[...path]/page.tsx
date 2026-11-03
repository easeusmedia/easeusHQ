import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { syncSalesInboxIfDue } from "@/lib/mailSync";
import { getViewer } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { addsPages, buildsDepartment } from "@/lib/scope";
import { visibleDepartments } from "../../departments";
import { DepartmentHead } from "../../DepartmentHead";
import { boardsOf, childCards, loadBoard, loadSheet, moveTargets, peopleOf, resolvePath, templatesOf } from "../../space/data";
import { LeadsView } from "../../space/LeadsView";
import { SpaceGrid, SpaceTitle } from "../../space/SpaceGrid";
import { PortalView } from "../../space/PortalView";

export const dynamic = "force-dynamic";
// the server actions on the page too: importing leads waits on Claude (ImportLeads)
export const maxDuration = 60;

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// A department's section (its portals, as cards) or portal (its boards, one
// open at a time: ?board=<slug>, else the first; a lead opens on ?lead=<id>).
// Only for the people in the department (Level 1: every one).
export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; path: string[] }>;
  searchParams: Promise<{ board?: string | string[]; lead?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const [{ slug, path }, query] = await Promise.all([params, searchParams]);
  const team = (await visibleDepartments(viewer)).find((d) => d.slug === slug);
  if (!team) notFound();
  // Sales' boards count opens and replies from the sales inbox: read it
  // again after this page has gone (at most every 10 minutes)
  if (slug === "sales") after(() => syncSalesInboxIfDue());
  const nodes = await resolvePath(team.id, path);
  if (!nodes) {
    // an old link through a section that's gone: the portal moved up; an
    // old link to a portal since put in a section (Sales > Podcast, now in
    // Outreach: 3 Nov 2026): the portal moved down
    const up = path.length === 2 && (await resolvePath(team.id, path.slice(1)));
    const down = path.length === 1 && (await prisma.space.findFirst({ where: { teamId: team.id, slug: path[0], kind: "portal", parent: { kind: "section", parentId: null } }, select: { parent: { select: { slug: true } } } }));
    if (!up && !down) notFound();
    const keep = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/org/${slug}/${down ? `${down.parent!.slug}/${path[0]}` : path[1]}${keep.size ? `?${keep}` : ""}`);
  }

  const node = nodes[nodes.length - 1];
  const home = `/org/${slug}`;
  const href = (i: number) => [home, ...nodes.slice(0, i + 1).map((n) => n.slug)].join("/");
  // the steps above this page: the department, then any section it's in
  const parents = [{ name: team.name, href: home }, ...nodes.slice(0, -1).map((n, i) => ({ name: n.name, href: href(i) }))];
  const canBuild = buildsDepartment(viewer, team.id);
  // a new portal, board or Leads tab: Sales' Level 2 too
  const canAdd = addsPages(viewer, team.id);
  const here = href(nodes.length - 1);

  if (node.kind === "section") {
    const [cards, templates] = await Promise.all([childCards(team.id, node.id, here), templatesOf(team.id, "portal")]);
    const leads = cards.reduce((n, c) => n + c.leads, 0);
    return (
      <>
        <DepartmentHead parents={parents} aside={cards.length > 0 && `${plural(cards.length, "portal")} holding ${plural(leads, "lead")}`}>
          <SpaceTitle id={node.id} name={node.name} canRename={canBuild} />
        </DepartmentHead>
        <SpaceGrid teamId={team.id} parentId={node.id} kind="portal" base={here} cards={cards} canBuild={canBuild} canAdd={canAdd} templates={templates} />
      </>
    );
  }

  // a portal: its boards as tabs, the open one in full
  const boards = await boardsOf(node.id);
  const pick = typeof query.board === "string" ? query.board : undefined;
  const active = boards.find((b) => b.slug === pick) ?? boards[0];

  // Sales > Leads: each tab a spreadsheet of the leads found
  if (node.leadBank) {
    const [sheet, targets] = await Promise.all([active ? loadSheet(active.id) : null, moveTargets(team.id)]);
    return (
      <>
        <DepartmentHead parents={parents}>
          <SpaceTitle id={node.id} name={node.name} canRename={canBuild} />
        </DepartmentHead>
        <LeadsView teamId={team.id} portal={{ id: node.id, name: node.name }} boards={boards} sheet={sheet} targets={targets} canBuild={canBuild} canAdd={canAdd} initialLeadId={typeof query.lead === "string" ? query.lead : null} />
      </>
    );
  }
  const [board, people, boardTemplates, targets] = await Promise.all([active ? loadBoard(active.id) : null, peopleOf(team.id), templatesOf(team.id, "board"), moveTargets(team.id)]);
  return (
    <>
      <DepartmentHead parents={parents}>
        <SpaceTitle id={node.id} name={node.name} canRename={canBuild} />
      </DepartmentHead>
      <PortalView
        teamId={team.id}
        portal={{ id: node.id, name: node.name }}
        boards={boards}
        board={board}
        people={people}
        canBuild={canBuild}
        canAdd={canAdd}
        boardTemplates={boardTemplates}
        targets={targets}
        initialLeadId={typeof query.lead === "string" ? query.lead : null}
      />
    </>
  );
}
