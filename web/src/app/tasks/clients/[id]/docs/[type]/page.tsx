import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { DocEditor } from "../../../DocEditor";
import type { ClientDocType } from "../../../actions";

export const dynamic = "force-dynamic";

const DOC_LABEL: Record<ClientDocType, string> = {
  brandGuidelines: "Brand guidelines",
  sop: "SOP",
  resources: "Resources",
};

export default async function ClientDocPage({ params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params;
  if (type !== "brandGuidelines" && type !== "sop" && type !== "resources") notFound();
  const doc = type as ClientDocType;

  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");
  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || me.role === "employee") redirect("/tasks");

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, brandGuidelines: true, sop: true, resources: true },
  });
  if (!client) notFound();

  return (
    <>
      <Link href={`/tasks/clients/${id}`} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> {client.name}
      </Link>
      <h1 className="mb-6 text-xl font-semibold">
        {client.name} · {DOC_LABEL[doc]}
      </h1>
      <DocEditor clientId={id} doc={doc} label={DOC_LABEL[doc]} content={client[doc] as string | null} />
    </>
  );
}
