import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { getClientTemplate } from "../actions";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

export default async function ClientTemplatePage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (me?.role === "employee") redirect("/tasks"); // admin/core only

  const template = await getClientTemplate();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/tasks/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Client template</h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        The structure every new client is created with — their deliverables, the onboarding steps ops works through,
        and the starting text for each of their documents. Changing it here changes what the next client gets;
        clients already on the roster keep what they have.
      </p>

      <TemplateEditor initial={template} />
    </div>
  );
}
