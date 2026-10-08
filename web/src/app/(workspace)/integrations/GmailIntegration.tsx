"use client";

import { useRouter } from "next/navigation";
import { Check, Mail } from "lucide-react";
import { gmailConsentUrl } from "@/lib/driveClient";
import { disconnectGmail } from "./actions";

// A Gmail inbox, read-only:
// - contracts: easeus.media@gmail.com. Adobe's emails there say when a
//   contract sent through Acrobat has gone out and when it's signed, so the
//   contract pages follow along by themselves, signed copy included.
// - sales: sales.easeus.media@gmail.com, for the Email pages' replies,
//   received emails and response times.
const COPY = {
  contracts: {
    title: "Contract tracking (Gmail)",
    address: "easeus.media@gmail.com",
    about: "Read-only. Adobe emails easeus.media@gmail.com when a contract is sent, signed and filed, so each contract updates automatically and keeps its signed copy.",
  },
  sales: {
    title: "Sales inbox (Gmail)",
    address: "sales.easeus.media@gmail.com",
    about: "Read-only. Replies, received emails and response times for the Email pages come from sales.easeus.media@gmail.com.",
  },
};

export function GmailIntegration({ account, clientId, inbox = "contracts" }: { account: string | null; clientId: string; inbox?: "contracts" | "sales" }) {
  const copy = COPY[inbox];
  const router = useRouter();
  return (
    <section className="mb-4 flex break-inside-avoid flex-col gap-3 panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Mail size={18} className="text-muted" />
          <h2 className="text-base font-medium">{copy.title}</h2>
          {account !== null && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
              <Check size={11} /> {account || "Connected"}
            </span>
          )}
        </div>
        {account !== null ? (
          <button
            type="button"
            onClick={async () => {
              await disconnectGmail(inbox);
              router.refresh();
            }}
            className="btn btn-xs btn-ghost"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={!clientId}
            onClick={() => (window.location.href = gmailConsentUrl(clientId, window.location.origin, inbox))}
            className="btn btn-sm btn-glow disabled:opacity-50"
          >
            Connect {copy.address}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        {copy.about}
        {!clientId && " Set up the Google app under Google Drive first."}
      </p>
    </section>
  );
}
