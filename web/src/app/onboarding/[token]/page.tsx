import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { driveConfigured } from "@/lib/drive";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome to Easeus Media",
  // a private link: keep it out of search engines
  robots: { index: false, follow: false },
};

// The form a new client fills in, at /onboarding/<token>. No sign-in: the
// token is the permission (see onboarding/actions.ts). Kept deliberately
// short — a client has a business to run, and everything else can be asked
// once the work is under way.
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  // ?sent — just submitted, so this renders the thank-you rather than the
  // "already filled in" notice. Sending the form re-renders this page (every
  // server action does), which is why the confirmation comes from here
  // rather than from state the form was holding.
  searchParams: Promise<{ sent?: string }>;
}) {
  const [{ token }, { sent }] = await Promise.all([params, searchParams]);
  const invite = await prisma.clientInvite.findUnique({ where: { token }, select: { name: true, usedAt: true } });

  if (invite?.usedAt && sent) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-2xl text-emerald-300">✓</span>
        <h1 className="text-xl font-semibold">Thank you — you&apos;re all set</h1>
        <p className="text-sm text-muted">
          {sent === "partial"
            ? "Your details are with the team. We'll be in touch about the files."
            : "Your details are with the team. We'll be in touch with next steps shortly."}
        </p>
      </main>
    );
  }

  if (!invite || invite.usedAt) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">{invite ? "This form is already filled in" : "This link isn't valid"}</h1>
        <p className="text-sm text-muted">
          {invite
            ? "Thanks — we have your details. If something needs changing, just message your contact at Easeus."
            : "Ask your contact at Easeus Media for a new link."}
        </p>
      </main>
    );
  }

  return <OnboardingForm token={token} suggestedName={invite.name ?? ""} canUpload={await driveConfigured()} />;
}
