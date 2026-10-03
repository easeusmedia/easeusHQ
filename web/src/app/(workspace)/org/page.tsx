import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { visibleDepartments } from "./departments";
import { OrgMap } from "./OrgMap";
import { orgData } from "./orgData";

export const dynamic = "force-dynamic";

// The agency at a glance (OrgMap): a panel a department with each of its
// people and what they're on, opening its own page. Only the departments
// someone is in (Level 1: all).
export default async function OrganizationPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const departments = await visibleDepartments(viewer);
  if (departments.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">You aren&apos;t in a department yet.</p>
      </div>
    );

  return <OrgMap departments={await orgData(departments)} />;
}
