import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { buildsDepartment } from "@/lib/scope";
import { visibleDepartments } from "../departments";
import { DepartmentHead } from "../DepartmentHead";
import { ProductionBoard } from "../ProductionBoard";
import { childCards } from "../space/data";
import { SpaceGrid } from "../space/SpaceGrid";

export const dynamic = "force-dynamic";

// A department's own page. Production's is its board (Video editing and
// Graphic design); the rest are their sections, each opening onto its
// portals. Only for the people in it (Level 1: every one).
export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { slug } = await params;
  const department = (await visibleDepartments(viewer)).find((d) => d.slug === slug);
  // the Board's old address lands here: someone outside Production goes Home instead
  if (!department) return slug === "production" ? redirect("/home") : notFound();
  if (slug === "production") return <ProductionBoard scope={(await searchParams).scope} name={department.name} />;

  const base = `/org/${slug}`;
  const cards = await childCards(department.id, null, base);
  return (
    <>
      <DepartmentHead name={department.name} />
      <header className="mt-6 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{department.name}</h1>
        {cards.length > 0 && (
          <p className="mt-1.5 text-sm text-muted">
            {cards.length} {cards.length === 1 ? "section" : "sections"}, each with its own portals and boards.
          </p>
        )}
      </header>
      <SpaceGrid teamId={department.id} parentId={null} kind="section" base={base} cards={cards} canBuild={buildsDepartment(viewer, department.id)} />
    </>
  );
}
