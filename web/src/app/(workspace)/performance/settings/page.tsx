import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { loadCategories, loadScoring } from "../data";
import { ScoringForm, TypesPanel } from "./forms";

export const dynamic = "force-dynamic";

// How editors are scored, in one place: the points each metric is worth,
// the grades, what goes into each metric (admin), and the mistake types
// and feedback types with what each means (core).
export default async function PerformanceSettingsPage() {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const [scoring, categories, kinds] = await Promise.all([
    loadScoring(),
    loadCategories(),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const section = "flex flex-col gap-4";

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link href="/performance" className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft size={13} /> Editor performance
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance settings</h1>
          <p className="mt-1.5 text-sm text-muted">How editors are scored, and the types their mistakes and feedback are sorted into.</p>
        </div>
      </div>

      <section className={section}>
        <div>
          <h2 className="text-base font-semibold">Scoring</h2>
          <p className="mt-0.5 text-sm text-muted">Every week is scored out of 10 and graded. A month is the average of its weeks.</p>
        </div>
        {canEditPeople(me) ? <ScoringForm scoring={scoring} kinds={kinds.map((k) => k.name)} /> : <p className="text-sm text-muted">Only the admin can change the scoring.</p>}
      </section>

      <section className={section}>
        <div>
          <h2 className="text-base font-semibold">Mistake types</h2>
          <p className="mt-0.5 text-sm text-muted">
            Every Frame.io comment that asks for a fix goes to the type whose keywords it uses most, or to Others. &ldquo;Counts&rdquo; is how many mistakes one is worth against Quality: 1 is a full mistake, 0.1 a tenth. &ldquo;Repeats&rdquo; means the same type again, on another video, counts double.
          </p>
        </div>
        <TypesPanel group="mistake" types={categories.filter((c) => c.group === "mistake")} />
      </section>

      <section className={section}>
        <div>
          <h2 className="text-base font-semibold">Feedback types</h2>
          <p className="mt-0.5 text-sm text-muted">What praise and concerns can be about, such as Communication or Deadlines.</p>
        </div>
        <TypesPanel group="feedback" types={categories.filter((c) => c.group === "feedback")} />
      </section>
    </div>
  );
}
