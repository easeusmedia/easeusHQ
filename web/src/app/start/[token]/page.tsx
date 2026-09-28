import type { Metadata } from "next";
import { Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { greetingName, withDefaults } from "@/lib/contract";
import { Shell } from "../Shell";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your agreement · Easeus Media",
  // a private link: keep it out of search engines
  robots: { index: false, follow: false },
};

// Where a new client tells us what their contract needs, at /start/<token>
// — the link ops makes under Contracts. It works until the form is sent.
export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await prisma.contract.findUnique({ where: { token }, select: { status: true, details: true } });

  if (!contract) {
    return (
      <Shell>
        <h1 className="text-[26px] font-semibold tracking-tight">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Ask your contact at Easeus Media for a new link.</p>
      </Shell>
    );
  }

  // Already sent: thank them by name, and say where their agreement is now
  if (contract.status !== "invited") {
    const d = withDefaults(contract.details);
    const first = greetingName(d.contactName);
    const to = (d.signatories[0]?.email || d.contactEmail).trim();
    const note =
      contract.status === "signed"
        ? "Your agreement is signed. Welcome to Easeus Media. A copy is in your email."
        : contract.status === "sent"
          ? `Your agreement is on its way. Look out for Adobe's email${to ? ` to ${to}` : ""} to sign it.`
          : `We have your details. Your agreement will be sent${to ? ` to ${to}` : ""} for e-signature shortly.`;
    return (
      // where they are: signed (every step done), sent (signing), or with us
      <Shell step={contract.status === "signed" ? 4 : contract.status === "sent" ? 3 : 2}>
        <div className="fade-in flex flex-col items-start">
          <span className="badge-lit emerald flex size-11 items-center justify-center rounded-2xl">
            <Check size={20} />
          </span>
          <h1 className="mt-6 text-[26px] font-semibold tracking-tight">{first ? `Thank you, ${first}.` : "Thank you."}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{note}</p>
          <p className="mt-6 text-xs text-muted/70">Anything to change? Just message your contact at Easeus Media.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <IntakeForm token={token} />
    </Shell>
  );
}
