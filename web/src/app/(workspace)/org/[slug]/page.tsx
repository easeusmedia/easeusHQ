import { notFound, redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { visibleDepartments } from "../departments";
import { DepartmentHead } from "../DepartmentHead";
import { ProductionBoard } from "../ProductionBoard";

export const dynamic = "force-dynamic";

// A department's own page. Production's is its board (Video editing and
// Graphic design); the rest are still to come. Only for the people in it
// (Level 1: every one).
export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { slug } = await params;
  const department = (await visibleDepartments(viewer)).find((d) => d.slug === slug);
  // the Board's old address lands here: someone outside Production goes Home instead
  if (!department) return slug === "production" ? redirect("/home") : notFound();
  if (slug === "production") return <ProductionBoard scope={(await searchParams).scope} name={department.name} />;
  return (
    <>
      <DepartmentHead name={department.name} />
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
        <LayoutGrid size={20} className="text-muted" />
        <p className="text-sm text-muted">{department.name}&apos;s board is on its way.</p>
      </div>
    </>
  );
}
