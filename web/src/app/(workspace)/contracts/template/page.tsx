import { redirect } from "next/navigation";
import { requireOps } from "@/lib/auth";
import { masterClauses } from "../masterTemplate";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

// The master template: the clauses every new contract starts from.
export default async function TemplatePage() {
  if (!(await requireOps())) redirect("/board");
  return <TemplateEditor clauses={await masterClauses()} />;
}
