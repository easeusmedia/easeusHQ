"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, Check } from "lucide-react";
import { calendarConsentUrl } from "@/lib/driveClient";
import { disconnectCalendar } from "./actions";

// easeus.media@gmail.com's calendar: its meetings show on Home, and a
// meeting made there goes into it with a Meet link and invites.
export function CalendarIntegration({ account, clientId }: { account: string | null; clientId: string }) {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-3 px-6 py-6">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-muted" />
          <h2 className="text-base font-medium">Meetings (Google Calendar)</h2>
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
              await disconnectCalendar();
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
            onClick={() => (window.location.href = calendarConsentUrl(clientId, window.location.origin))}
            className="btn btn-sm btn-glow disabled:opacity-50"
          >
            Connect easeus.media@gmail.com
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Its meetings show on Home, and a meeting made there is added to it with a Google Meet link and an invite to everyone on it. Only events, never the calendar&apos;s settings.
        {!clientId && " Set up the Google app under Google Drive first."}
      </p>
    </section>
  );
}
