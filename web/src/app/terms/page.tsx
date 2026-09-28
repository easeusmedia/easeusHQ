import type { Metadata } from "next";
import { ClipboardCheck, FileLock2, MessageCircle, ShieldCheck, UserCheck } from "lucide-react";
import { LegalPage, PublicShell, type Section } from "../PublicShell";

export const metadata: Metadata = { title: "Terms · Easeus Media" };

// Short terms for an internal tool. Google asks for a link to these when an
// app goes into production.
const SECTIONS: Section[] = [
  {
    id: "who",
    title: "Who may use it",
    Icon: UserCheck,
    tint: "75, 149, 230",
    body: (
      <p>
        Easeus HQ is for Easeus Media staff, and for clients of Easeus Media using a link we have sent them. It is not
        open to the public, and accounts are created by us.
      </p>
    ),
  },
  {
    id: "ask",
    title: "What we ask of you",
    Icon: ClipboardCheck,
    tint: "56, 189, 248",
    body: (
      <p>
        Use it for Easeus Media&apos;s work, keep your sign-in to yourself, and upload only material you have the right
        to share with us. We may suspend access that is misused.
      </p>
    ),
  },
  {
    id: "expect",
    title: "What you can expect",
    Icon: ShieldCheck,
    tint: "52, 211, 153",
    body: (
      <p>
        We keep the service running as well as we reasonably can, but it is provided as it is, without warranty. We are
        not liable for indirect or consequential loss arising from its use. Work delivered to a client is governed by
        our agreement with that client, not by this page.
      </p>
    ),
  },
  {
    id: "material",
    title: "Your material",
    Icon: FileLock2,
    tint: "167, 139, 250",
    body: (
      <p>
        What a client uploads stays theirs. We use it only to do the work they have engaged us for. How we handle it is
        set out in our <a href="/privacy">privacy statement</a>.
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
        Write to us at <a href="mailto:easeus.media@gmail.com">easeus.media@gmail.com</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <PublicShell current="terms">
      <LegalPage title="Terms of use" updated="28 September 2026" intro="The short terms for using Easeus HQ." sections={SECTIONS} />
    </PublicShell>
  );
}
