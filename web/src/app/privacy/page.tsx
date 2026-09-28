import type { Metadata } from "next";
import { Clock, Cookie, Database, HardDrive, Info, Mail, MessageCircle, UsersRound } from "lucide-react";
import { LegalPage, PublicShell, type Section } from "../PublicShell";

export const metadata: Metadata = { title: "Privacy · Easeus Media" };

// A plain statement of what this app holds and why. It exists for two
// audiences: clients filling in our forms, and Google, which won't let an
// app reach a Google account in production without one. Keep it true to
// what the app does: every connection it makes is named here.
const SECTIONS: Section[] = [
  {
    id: "what",
    title: "What this is",
    Icon: Info,
    tint: "75, 149, 230",
    body: (
      <p>
        Easeus HQ is the internal system Easeus Media uses to run client work: briefs, editing tasks, deliverables and
        client records. It isn&apos;t a public product, and there are no public sign-ups.
      </p>
    ),
  },
  {
    id: "hold",
    title: "What we hold",
    Icon: Database,
    tint: "56, 189, 248",
    body: (
      <ul>
        <li>Client details a client gives us: brand name, logo, contact name, email, WhatsApp number, address and public channel links.</li>
        <li>Details a client gives us for their agreement: their name, email, WhatsApp number, business name, country, address and who signs.</li>
        <li>Brand files a client chooses to upload when they onboard.</li>
        <li>Public numbers from a client&apos;s YouTube and Instagram: the views, likes and comments on their posts.</li>
        <li>Our own working records: tasks, timings, notes and documents about the work we do for each client.</li>
        <li>For our team: name, work email, role and the work assigned to them.</li>
      </ul>
    ),
  },
  {
    id: "google-drive",
    title: "Google Drive",
    Icon: HardDrive,
    tint: "52, 211, 153",
    body: (
      <p>
        With permission from an Easeus Media administrator, this app connects to one Google account belonging to Easeus
        Media and uses the <code className="text-xs">drive.file</code> permission. That permission covers only the files
        and folders this app creates itself: a folder for client files, and a folder for each client inside it. It
        cannot see, read or change anything else in that Google Drive. Files a client uploads on the onboarding form
        are placed in that client&apos;s folder.
      </p>
    ),
  },
  {
    id: "gmail",
    title: "Gmail",
    Icon: Mail,
    tint: "251, 113, 133",
    body: (
      <p>
        To follow each agreement through signing, the app has read-only access to one Easeus Media inbox
        (easeus.media@gmail.com), using the <code className="text-xs">gmail.readonly</code> permission. It reads only
        the emails Adobe Acrobat Sign sends about our agreements, when one is sent, signed and filed, and from them
        records each agreement&apos;s progress and keeps the signed copy. It never sends, changes or deletes email, and
        reads nothing else in that inbox. We don&apos;t use Google data for advertising, we don&apos;t sell it, and we
        don&apos;t transfer it to anyone except as described here.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and storage on your device",
    Icon: Cookie,
    tint: "251, 191, 36",
    body: (
      <>
        <p>We use a small number of cookies, and never for advertising or tracking.</p>
        <ul>
          <li>
            <b>Sign-in</b> (essential, 30 days): Keeps a team member signed in securely.
          </li>
          <li>
            <b>Cookie choice</b> (essential, 1 year): Remembers the choice you made on our cookie notice.
          </li>
          <li>
            <b>Sidebar layout</b> (preference, 1 year): Remembers whether the sidebar is open. Set only if you choose
            Accept all.
          </li>
        </ul>
        <p>
          The app also keeps a few small notes in your browser&apos;s own storage, such as where you were on a page and
          which notifications you have already seen. They never leave your device.
        </p>
      </>
    ),
  },
  {
    id: "who",
    title: "Who can see it",
    Icon: UsersRound,
    tint: "167, 139, 250",
    body: (
      <>
        <p>
          Only Easeus Media staff signed in to this app, and only as far as their role allows. A client&apos;s shared
          page shows that client their own work and nothing about anyone else.
        </p>
        <p>These services hold or process data on our behalf:</p>
        <ul>
          <li>
            <b>Vercel</b> hosts the app, and <b>Supabase</b> holds its database.
          </li>
          <li>
            <b>Google Drive</b> holds client files, and <b>Gmail</b> is read as described above.
          </li>
          <li>
            <b>Adobe Acrobat Sign</b> handles e-signatures on our agreements.
          </li>
          <li>
            <b>Anthropic</b> runs the contract assistant, which reads an agreement&apos;s details when we ask it to edit
            one.
          </li>
          <li>
            <b>Apify</b> reads the public YouTube and Instagram numbers of the accounts we manage.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long, and your choices",
    Icon: Clock,
    tint: "45, 212, 191",
    body: (
      <p>
        We keep a client&apos;s records for as long as they are a client, and our work history afterwards for our own
        accounting and quality review. Ask us and we will correct or delete what we hold about you. An administrator
        can disconnect Google Drive or Gmail at any time from the app&apos;s Integrations page, which ends its access
        immediately.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    Icon: MessageCircle,
    tint: "251, 146, 60",
    body: (
      <p>
        Questions about any of this? Write to us at <a href="mailto:easeus.media@gmail.com">easeus.media@gmail.com</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <PublicShell current="privacy">
      <LegalPage
        title="Privacy"
        updated="28 September 2026"
        intro="What Easeus HQ holds, why it holds it, and who can see it, written plainly."
        sections={SECTIONS}
      />
    </PublicShell>
  );
}
