import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { buildsDepartment } from "@/lib/scope";
import { visibleDepartments } from "../departments";
import { DepartmentHead } from "../DepartmentHead";
import { MailSection } from "../MailSection";
import { ProductionBoard } from "../ProductionBoard";
import { childCards, templatesOf } from "../space/data";
import { DepartmentTitle, SpaceGrid } from "../space/SpaceGrid";

export const dynamic = "force-dynamic";

// A department's own page. Production's is its board (Video editing and
// Graphic design); the rest are their portals (Sales: Podcast), each
// opening onto its boards. Only for the people in it (Level 1: every one).
export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string; mail?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { slug } = await params;
  const department = (await visibleDepartments(viewer)).find((d) => d.slug === slug);
  // the Board's old address lands here: someone outside Production goes Home instead
  if (!department) return slug === "production" ? redirect("/home") : notFound();
  if (slug === "production") return <ProductionBoard scope={(await searchParams).scope} id={department.id} name={department.name} />;

  const base = `/org/${slug}`;
  const [cards, templates] = await Promise.all([childCards(department.id, null, base), templatesOf(department.id, "portal")]);
  return (
    <>
      <DepartmentHead>
        <DepartmentTitle id={department.id} name={department.name} canRename={buildsDepartment(viewer, department.id)} />
      </DepartmentHead>
      <SpaceGrid teamId={department.id} parentId={null} kind="portal" base={base} cards={cards} canBuild={buildsDepartment(viewer, department.id)} templates={templates} />
      {slug === "sales" && <MailSection base={base} range={(await searchParams).mail} />}
    </>
  );
}
