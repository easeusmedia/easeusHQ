import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · Easeus Media" };

// Short terms for an internal tool — Google asks for a link to these when an
// app goes into production.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-sm text-muted">Easeus HQ · app.easeus.media · last updated 20 September 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-medium">Who may use it</h2>
          <p>
            Easeus HQ is for Easeus Media staff and for clients of Easeus Media using a link we have sent them. It is
            not open to the public and accounts are created by us.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">What we ask of you</h2>
          <p>
            Use it for Easeus Media&apos;s work, keep your sign-in to yourself, and upload only material you have the
            right to share with us. We may suspend access that is misused.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">What you can expect</h2>
          <p>
            We keep the service running as well as we reasonably can, but it is provided as-is, without warranty. We are
            not liable for indirect or consequential loss arising from its use. Work delivered to clients is governed by
            the agreement with that client, not by this page.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">Your material</h2>
          <p>
            What a client uploads stays theirs. We use it only to do the work they have engaged us for. How we handle it
            is set out in our <a className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300" href="/privacy">privacy statement</a>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium">Contact</h2>
          <p>
            <a className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300" href="mailto:team.easeusnow@gmail.com">team.easeusnow@gmail.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
