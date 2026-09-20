import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Easeus Media" };

// A plain statement of what this app holds and why. It exists for two
// audiences: clients filling in the onboarding form, and Google, which won't
// let an app reach a Google account in production without one.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Easeus HQ · app.easeus.media · last updated 20 September 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-medium">What this is</h2>
          <p>
            Easeus HQ is the internal system Easeus Media uses to run client work: briefs, editing tasks, deliverables
            and client records. It isn&apos;t a public product and has no public sign-ups.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">What we hold</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Client details a client gives us: brand name, logo, contact name, email, WhatsApp number, address and public channel links.</li>
            <li>Brand files a client chooses to upload when they onboard.</li>
            <li>Our own working records: tasks, timings, notes and documents about the work we do for that client.</li>
            <li>For our team: name, work email, role and the work assigned to them.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">Google Drive</h2>
          <p>
            With permission from a Easeus Media administrator, this app connects to one Google account belonging to
            Easeus Media, and uses the <code className="text-xs">drive.file</code> permission. That permission is limited
            to files and folders this app creates itself: a folder for client files, and a folder per client inside it.
            It cannot see, read or change anything else in that Google Drive. Files a client uploads on the onboarding
            form are placed in that client&apos;s folder. We don&apos;t use Google data for advertising, we don&apos;t
            sell it, and we don&apos;t transfer it to anyone except as described here.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">Who can see it</h2>
          <p>
            Only Easeus Media staff, signed in to this app, and only as far as their role allows. A client&apos;s own
            shared page shows that client their work and nothing about anyone else. We use Vercel for hosting, Supabase
            for the database and Google Drive for files; each holds this data on our behalf.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">How long, and your choices</h2>
          <p>
            We keep a client&apos;s records for as long as they are a client, and our work history afterwards for our own
            accounting and quality review. Ask us and we will correct or delete what we hold about you, and an
            administrator can disconnect Google Drive at any time from the app&apos;s Integrations page, which ends its
            access immediately.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">Contact</h2>
          <p>
            Questions about any of this: <a className="text-blue-400 underline underline-offset-2" href="mailto:team.easeusnow@gmail.com">team.easeusnow@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
