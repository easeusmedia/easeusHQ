import { redirect } from "next/navigation";
import { requireFounder } from "@/lib/auth";
import { masterClauses } from "../masterTemplate";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

// The master template: the clauses every new contract starts from.
export default async function TemplatePage() {
  if (!(await requireFounder())) redirect("/home");
  return <TemplateEditor clauses={await masterClauses()} />;
}
