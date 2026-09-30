import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { ClientTabs } from "../../clients/ClientTabs";
import { loadCategories, loadScoring } from "../data";
import { ScoringForm, TypesPanel } from "./forms";

export const dynamic = "force-dynamic";

// How editors are scored, in one place: the scoring (admin), and the
// mistake types with what each means and costs (core).
export default async function PerformanceSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const [{ tab }, scoring, categories, kinds] = await Promise.all([
    searchParams,
    loadScoring(),
    loadCategories(),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/performance" className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Editor performance
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Performance settings</h1>
      <ClientTabs
        width=""
        initialTab={tab}
        tabs={[
          {
            key: "scoring",
            label: "Scoring",
            content: canEditPeople(me) ? <ScoringForm scoring={scoring} kinds={kinds.map((k) => k.name)} /> : <p className="text-sm text-muted">Only the admin can change the scoring.</p>,
          },
          { key: "mistakes", label: "Mistake types", count: categories.length, content: <TypesPanel types={categories} /> },
        ]}
      />
    </div>
  );
}
