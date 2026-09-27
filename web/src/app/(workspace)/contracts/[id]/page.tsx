import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { withDefaults, type Clause } from "@/lib/contract";
import type { ChatMessage } from "../assistant";
import { ADOBE_SETTINGS, agreementStatus } from "@/lib/adobeSign";
import { ContractEditor } from "../ContractEditor";

export const dynamic = "force-dynamic";
// a message to the contract assistant can take Claude a few rounds
export const maxDuration = 60;

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOps())) redirect("/board");
  const { id } = await params;
  let contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  // out for signature: ask Adobe where it's got to, and note when it's signed
  let adobe: string | null = null;
  if (contract.status === "sent" && contract.agreementId) {
    adobe = await agreementStatus(contract.agreementId).catch(() => null);
    if (adobe === "SIGNED") {
      contract = await prisma.contract.update({ where: { id }, data: { status: "signed", signedAt: new Date() } });
    }
  }
  const adobeConnected = !!(await prisma.appSetting.findUnique({ where: { key: ADOBE_SETTINGS.api } }));

  return (
    <ContractEditor
      id={contract.id}
      token={contract.token}
      name={contract.name}
      status={contract.status}
      details={withDefaults(contract.details)}
      clauses={contract.clauses as Clause[]}
      chat={(contract.chat as ChatMessage[] | null) ?? []}
      today={indiaDay(new Date())}
      adobeConnected={adobeConnected}
      agreementStatus={adobe}
      sentByApi={!!contract.agreementId}
      sentAt={contract.sentAt ? contract.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : null}
    />
  );
}
