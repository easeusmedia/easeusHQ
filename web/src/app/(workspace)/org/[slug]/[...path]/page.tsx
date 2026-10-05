import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { buildsDepartment } from "@/lib/scope";
import { visibleDepartments } from "../../departments";
import { DepartmentHead } from "../../DepartmentHead";
import { boardsOf, childCards, loadBoard, peopleOf, resolvePath, templatesOf } from "../../space/data";
import { SpaceGrid, SpaceTitle } from "../../space/SpaceGrid";
import { PortalView } from "../../space/PortalView";

export const dynamic = "force-dynamic";

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
  const nodes = await resolvePath(team.id, path);
  if (!nodes) {
    // an old link through a section that's gone (Sales > Outreach > Podcast): the portal moved up
    const moved = path.length === 2 && (await resolvePath(team.id, path.slice(1)));
    if (!moved) notFound();
    const keep = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/org/${slug}/${path[1]}${keep.size ? `?${keep}` : ""}`);
  }

  const node = nodes[nodes.length - 1];
  const home = `/org/${slug}`;
  const href = (i: number) => [home, ...nodes.slice(0, i + 1).map((n) => n.slug)].join("/");
  // the steps above this page: the department, then any section it's in
  const parents = [{ name: team.name, href: home }, ...nodes.slice(0, -1).map((n, i) => ({ name: n.name, href: href(i) }))];
  const canBuild = buildsDepartment(viewer, team.id);
  const here = href(nodes.length - 1);

  if (node.kind === "section") {
    const [cards, templates] = await Promise.all([childCards(team.id, node.id, here), templatesOf(team.id, "portal")]);
    const leads = cards.reduce((n, c) => n + c.leads, 0);
    return (
      <>
        <DepartmentHead parents={parents} aside={cards.length > 0 && `${plural(cards.length, "portal")} holding ${plural(leads, "lead")}`}>
          <SpaceTitle id={node.id} name={node.name} />
        </DepartmentHead>
        <SpaceGrid teamId={team.id} parentId={node.id} kind="portal" base={here} cards={cards} canBuild={canBuild} templates={templates} />
      </>
    );
  }

  // a portal: its boards as tabs, the open one in full
  const boards = await boardsOf(node.id);
  const pick = typeof query.board === "string" ? query.board : undefined;
  const active = boards.find((b) => b.slug === pick) ?? boards[0];
  const [board, people, boardTemplates] = await Promise.all([active ? loadBoard(active.id) : null, peopleOf(team.id), templatesOf(team.id, "board")]);
  return (
    <>
      <DepartmentHead parents={parents}>
        <SpaceTitle id={node.id} name={node.name} />
      </DepartmentHead>
      <PortalView
        teamId={team.id}
        portal={{ id: node.id, name: node.name }}
        boards={boards}
        board={board}
        people={people}
        canBuild={canBuild}
        viewerId={viewer.id}
        boardTemplates={boardTemplates}
        initialLeadId={typeof query.lead === "string" ? query.lead : null}
      />
    </>
  );
}
