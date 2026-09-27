import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
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
  const contract = await prisma.contract.findUnique({ where: { token }, select: { status: true } });

  if (!contract || contract.status !== "invited") {
    return (
      <Shell>
        <h1 className="text-[24px] font-normal tracking-tight">
          {contract ? "We have your details" : "This link isn't valid"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          {contract
            ? "Thanks — your agreement is being prepared. If anything needs changing, just message your contact at Easeus Media."
            : "Ask your contact at Easeus Media for a new link."}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <IntakeForm token={token} />
    </Shell>
  );
}
