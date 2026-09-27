import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { withDefaults, type Clause } from "@/lib/contract";
import type { ChatMessage } from "../assistant";
import { ContractEditor } from "../ContractEditor";
import { trackContracts, type TrackedEvent } from "../tracking";
import { gmailAccount } from "@/lib/gmail";

export const dynamic = "force-dynamic";
// a message to the contract assistant can take Claude a few rounds
export const maxDuration = 60;

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOps())) redirect("/board");
  const { id } = await params;
  let contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  // out through Acrobat: what Adobe's emails say about it since the last look
  if (contract.status === "approved" || contract.status === "sent" || (contract.status === "signed" && !contract.signedPdf)) {
    await trackContracts(id).catch(() => {});
    contract = (await prisma.contract.findUnique({ where: { id } }))!;
  }

  return (
    <ContractEditor
      // a new status (tracking found it signed) starts the page afresh, rather
      // than it holding on to the status it opened with
      key={contract.status}
      id={contract.id}
      token={contract.token}
      name={contract.name}
      status={contract.status}
      details={withDefaults(contract.details)}
      clauses={contract.clauses as Clause[]}
      chat={(contract.chat as ChatMessage[] | null) ?? []}
      today={indiaDay(new Date())}
      events={((contract.events as TrackedEvent[] | null) ?? []).map((e) => ({
        ...e,
        // written here, so the browser shows exactly what the server did
        when: new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
      }))}
      tracking={(await gmailAccount()) !== null}
      hasSignedCopy={!!contract.signedPdf}
      sentAt={contract.sentAt ? contract.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : null}
    />
  );
}
