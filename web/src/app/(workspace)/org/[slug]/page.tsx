import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { buildsDepartment, isLead, seesClients } from "@/lib/scope";
import { getRealUserId } from "@/lib/auth";
import { visibleDepartments } from "../departments";
import { DepartmentHead } from "../DepartmentHead";
import { ProductionBoard } from "../ProductionBoard";
import { SalesHome } from "../SalesHome";
import { childCards, templatesOf } from "../space/data";
import { DepartmentTitle, SpaceGrid } from "../space/SpaceGrid";

export const dynamic = "force-dynamic";

// A department's own page. Production's is its board (Video editing and
// Graphic design); Sales' its home (SalesHome); the rest are their portals,
// each opening onto its boards. Only for the people in it (Level 1: every one).
export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { slug } = await params;
  const department = (await visibleDepartments(viewer)).find((d) => d.slug === slug);
  // the Board's old address lands here: someone outside Production goes Home instead
  if (!department) return slug === "production" ? redirect("/home") : notFound();
  if (slug === "production") return <ProductionBoard scope={(await searchParams).scope} id={department.id} name={department.name} />;

  const base = `/org/${slug}`;
  const head = (
    <DepartmentHead>
      <DepartmentTitle id={department.id} name={department.name} canRename={buildsDepartment(viewer, department.id)} />
    </DepartmentHead>
  );
  // Sales' is its home: what's going on in outreach (its pages are in the sidebar)
  if (slug === "sales")
    return (
      <>
        {head}
        <SalesHome teamId={department.id} team={slug} notices={seesClients(viewer) ? undefined : { forId: viewer.id, real: (await getRealUserId()) === viewer.id, canForward: isLead(viewer) }} />
      </>
    );
  const [cards, templates] = await Promise.all([childCards(department.id, null, base), templatesOf(department.id, "portal")]);
  return (
    <>
      {head}
      <SpaceGrid teamId={department.id} parentId={null} kind="portal" base={base} cards={cards} canBuild={buildsDepartment(viewer, department.id)} templates={templates} />
    </>
  );
}
