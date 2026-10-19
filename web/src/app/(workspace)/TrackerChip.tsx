"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { PrefetchLink as Link } from "./PrefetchLink";
import { myTrackerSeen } from "./email/actions";

// Whether the mail tracker (/extension, 1.0.7 on) is in this browser and
// reports to this site, asked the way the Mail tracker page asks it. Opens
// and clicks only count from emails sent where it's on, so the boards and
// the Email page show it beside their numbers. Opens that page to set it up.
// Not in this browser (Safari and the Dock app can't hold it): on if yours
// checked in from Chrome in the last SEEN_DAYS ("away", 1.0.8 on, every half
// hour while Chrome is open); 1.0.7 works but can't check in ("update").
type State = "asking" | "here" | "update" | "away" | "elsewhere" | "idle" | "missing";
// ponytail: a weekend with Chrome closed is still "on"; a removed tracker shows red after this
const SEEN_DAYS = 3;
export const CHECKS_IN = "1.0.8";
export const older = (v: string, than: string) => {
  const [a, b] = [v, than].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  return false;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const ON = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]";

const LOOK: Record<Exclude<State, "asking">, { dot: string; text: (base: string) => string; title: string }> = {
  here: { dot: ON, text: () => "Mail tracker on", title: "Emails you send from Gmail in this browser are tracked." },
  update: { dot: "bg-amber-400", text: () => "Update mail tracker", title: `Emails are tracked, but update the tracker to ${CHECKS_IN} so Safari and the Dock app can tell it's on.` },
  away: { dot: ON, text: () => "Mail tracker on", title: "" },
  elsewhere: {
    dot: "bg-amber-400",
    text: (base) => `Mail tracker reports to ${base.replace(/^https?:\/\//, "")}`,
    title: "This browser's tracker sends its emails to another site. Open the Mail tracker page to connect it here.",
  },
  idle: { dot: "bg-amber-400", text: () => "Connect mail tracker", title: "The tracker is in this browser but not connected yet. Open the Mail tracker page to connect it." },
  missing: { dot: "bg-rose-400", text: () => "Set up mail tracker", title: `Your mail tracker hasn't checked in from Chrome in ${SEEN_DAYS} days. Install it there, or update it to ${CHECKS_IN}. Opens and clicks aren't tracked until it's on.` },
};

// While the page is on screen the sales inbox is read every minute, and the
// moment you come back to it (from replying in Gmail, say), so replies
// reach the numbers by themselves (api/mail/sync, every 15 seconds at most)
function useInboxSync() {
  useEffect(() => {
    const read = () => document.visibilityState === "visible" && fetch("/api/mail/sync", { method: "POST" }).catch(() => null);
    read();
    const timer = setInterval(read, 60_000);
    document.addEventListener("visibilitychange", read);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);
}

export function TrackerChip() {
  useInboxSync();
  const [state, setState] = useState<State>("asking");
  const [base, setBase] = useState("");
  const [seen, setSeen] = useState<{ at: string; version: string } | null>(null);

  useEffect(() => {
    const hear = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== "easeus-mail-tracker:here") return;
      const to = typeof e.data.base === "string" ? e.data.base : "";
      setBase(to);
      setState(!to ? "idle" : to !== window.location.origin ? "elsewhere" : older(String(e.data.version ?? ""), CHECKS_IN) ? "update" : "here");
    };
    window.addEventListener("message", hear);
    window.postMessage({ type: "easeus-mail-tracker:ping" }, window.location.origin);
    // no answer in two seconds: not in this browser (or older than 1.0.7),
    // so whether yours checked in from Chrome lately
    const timer = setTimeout(async () => {
      const last = await myTrackerSeen().catch(() => null);
      const away = !!last && Date.now() - new Date(last.at).getTime() < SEEN_DAYS * 86_400_000;
      setSeen(last);
      setState((s) => (s === "asking" ? (away ? "away" : "missing") : s));
    }, 2000);
    return () => {
      window.removeEventListener("message", hear);
      clearTimeout(timer);
    };
  }, []);

  if (state === "asking") return null;
  const look = LOOK[state];
  return (
    <Link href="/mail-tracker" title={state === "away" && seen ? `On in Chrome (${seen.version}), last checked in ${when(seen.at)}.` : look.title} className="btn btn-sm btn-glow fade-in inline-flex items-center gap-2">
      <Mail size={14} className="text-sky-400" />
      {look.text(base)}
      <span className={`size-2 shrink-0 rounded-full ${look.dot}`} />
    </Link>
  );
}
