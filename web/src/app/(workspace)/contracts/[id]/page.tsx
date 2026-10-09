import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFounder } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { withDefaults, type Clause } from "@/lib/contract";
import type { ChatMessage } from "../assistant";
import type { ClientIntake } from "../ContractForm";
import { ContractEditor } from "../ContractEditor";
import { trackContracts, type TrackedEvent } from "../tracking";
import { gmailAccount } from "@/lib/gmail";

export const dynamic = "force-dynamic";
// a message to the contract assistant can take Claude a few rounds
export const maxDuration = 60;

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireFounder())) redirect("/home");
  const { id } = await params;
  // the signed PDF itself stays in the database: whether there is one is all
  // this page needs, and loading the file slowed every open
  const [contract, signedCopies] = await Promise.all([
    prisma.contract.findUnique({ where: { id }, omit: { signedPdf: true } }),
    prisma.contract.count({ where: { id, signedPdf: { not: null } } }),
  ]);
  if (!contract) notFound();

  // Out through Acrobat: what Adobe's emails say about it since the last
  // look. Read after the page is sent, not before — Gmail takes a second or
  // two — and anything it finds reaches this page on the next pulse.
  if (contract.status === "approved" || contract.status === "sent" || (contract.status === "signed" && !signedCopies)) {
    after(() => trackContracts(id).catch(() => {}));
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
      hasSignedCopy={signedCopies > 0}
      intake={(contract.intake as ClientIntake | null) ?? null}
      submittedOn={contract.submittedAt ? contract.submittedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : null}
      sentAt={contract.sentAt ? contract.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : null}
    />
  );
}
