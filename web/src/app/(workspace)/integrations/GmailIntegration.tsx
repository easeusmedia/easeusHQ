"use client";

import { useRouter } from "next/navigation";
import { Check, Mail } from "lucide-react";
import { gmailConsentUrl } from "@/lib/driveClient";
import { disconnectGmail } from "./actions";

// easeus.media@gmail.com, read-only: Adobe's emails there say when a
// contract sent through Acrobat has gone out and when it's signed — the
// contract pages follow along by themselves, signed copy included.
export function GmailIntegration({ account, clientId }: { account: string | null; clientId: string }) {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-3 px-6 py-6">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Mail size={18} className="text-muted" />
          <h2 className="text-base font-medium">Contract tracking (Gmail)</h2>
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
              await disconnectGmail();
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
            onClick={() => (window.location.href = gmailConsentUrl(clientId, window.location.origin))}
            className="btn btn-sm btn-glow disabled:opacity-50"
          >
            Connect easeus.media@gmail.com
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Read-only. Adobe emails easeus.media@gmail.com when a contract is sent, signed and filed, so each contract updates automatically and keeps its signed copy.
        {!clientId && " Set up the Google app under Google Drive first."}
      </p>
    </section>
  );
}
