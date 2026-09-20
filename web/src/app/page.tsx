import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Easeus HQ",
  description:
    "The internal system Easeus Media runs its client work on: briefs, editing pipeline, deliverables and client records.",
};

// The front door. Signed in, it's the board you actually want; signed out,
// it's a plain description of what this is — which is also what Google asks
// for of any app that connects to a Google account: a homepage anyone can
// read, not a login wall.
export default async function Home() {
  if (await getSessionUserId()) redirect("/board");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" priority />
        <h1 className="text-3xl font-semibold tracking-tight">Easeus HQ</h1>
        <p className="text-sm leading-relaxed text-muted">
          The internal system Easeus Media runs its client work on. It holds the editing pipeline from brief to
          delivery, every client&apos;s record and documents, the team&apos;s own tasks, and the history of what has
          been finished. It is used by Easeus Media staff and by our clients through links we send them — there are no
          public sign-ups.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-5 text-sm leading-relaxed">
        <h2 className="text-base font-medium">What it does</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>Tracks each video from queued through editing, review and client approval to delivery.</li>
          <li>Keeps each client&apos;s brief, brand documents, deliverables and finished files in one place.</li>
          <li>Gives a client their own read-only page for the work in progress, and a form to onboard with.</li>
          <li>
            Connects to the Easeus Media Google Drive, with permission limited to the folders this app creates, so
            files a client uploads land in that client&apos;s folder.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/login" className="btn-glow rounded-xl px-5 py-2.5 text-sm font-medium">
          Team sign in
        </Link>
        <Link href="/privacy" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">
          Privacy
        </Link>
        <Link href="/terms" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">
          Terms
        </Link>
      </div>

      <p className="text-xs text-muted">
        Easeus Media · <a className="underline underline-offset-2" href="mailto:team.easeusnow@gmail.com">team.easeusnow@gmail.com</a>
      </p>
    </main>
  );
}
