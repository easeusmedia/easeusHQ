import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Clapperboard, Eye, FolderOpen, HardDrive, type LucideIcon } from "lucide-react";
import { PublicShell } from "./PublicShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Easeus HQ",
  description:
    "The internal system Easeus Media runs its client work on: briefs, editing pipeline, deliverables and client records.",
};

const FEATURES: { Icon: LucideIcon; tint: string; title: string; body: string }[] = [
  { Icon: Clapperboard, tint: "75, 149, 230", title: "The editing pipeline", body: "Every video from queued through editing, review and client approval to delivery." },
  { Icon: FolderOpen, tint: "52, 211, 153", title: "Every client in one place", body: "Briefs, brand documents, deliverables and finished files, together." },
  { Icon: Eye, tint: "167, 139, 250", title: "A page for each client", body: "A read-only view of their work in progress, and forms to onboard and agree terms." },
  { Icon: HardDrive, tint: "251, 191, 36", title: "Files where they belong", body: "Uploads land in that client's own Google Drive folder, and nowhere else." },
];

// The front door. Signed in, it's the board you actually want; signed out,
// it's a plain description of what this is, which is also what Google asks
// of any app that connects to a Google account: a homepage anyone can read,
// not a login wall.
export default async function Home() {
  const id = await getSessionUserId();
  // a Founder starts on Home; everyone else on the Board
  if (id) redirect((await prisma.user.findUnique({ where: { id }, select: { role: true } }))?.role === "admin" ? "/home" : "/board");

  return (
    <PublicShell>
      <div className="max-w-2xl">
        <span className="badge flex size-12 items-center justify-center rounded-2xl">
          <Image src="/logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" priority />
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Easeus HQ</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          The internal system Easeus Media runs its client work on: the editing pipeline from brief to delivery, every
          client&apos;s record and documents, the team&apos;s own tasks, and the history of what has been finished. It is
          used by Easeus Media staff, and by our clients through links we send them. There are no public sign-ups.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Link href="/login" className="btn-primary flex h-11 items-center rounded-xl px-5 text-sm font-semibold">
            Team sign in
          </Link>
          <Link href="/privacy" className="btn btn-ghost h-11 rounded-xl px-4">
            How we handle data
          </Link>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ Icon, tint, title, body }) => (
          <div key={title} className="panel rounded-2xl p-6">
            <span className="badge-lit flex size-9 items-center justify-center rounded-xl" style={{ "--tint": tint } as React.CSSProperties}>
              <Icon size={16} />
            </span>
            <p className="mt-4 text-sm font-medium">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </PublicShell>
  );
}
