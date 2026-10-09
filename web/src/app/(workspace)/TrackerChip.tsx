"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { PrefetchLink as Link } from "./PrefetchLink";

// Whether the mail tracker (/extension, 1.0.7 on) is in this browser and
// reports to this site, asked the way the Mail tracker page asks it. Opens
// and clicks only count from emails sent where it's on, so the boards and
// the Email page show it beside their numbers. Opens that page to set it up.
type State = "asking" | "here" | "elsewhere" | "idle" | "missing";

const LOOK: Record<Exclude<State, "asking">, { dot: string; text: (base: string) => string; title: string }> = {
  here: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]", text: () => "Mail tracker on", title: "Emails you send from Gmail in this browser are tracked." },
  elsewhere: {
    dot: "bg-amber-400",
    text: (base) => `Mail tracker reports to ${base.replace(/^https?:\/\//, "")}`,
    title: "This browser's tracker sends its emails to another site. Open the Mail tracker page to connect it here.",
  },
  idle: { dot: "bg-amber-400", text: () => "Connect mail tracker", title: "The tracker is in this browser but not connected yet. Open the Mail tracker page to connect it." },
  missing: { dot: "bg-rose-400", text: () => "Set up mail tracker", title: "The mail tracker isn't in this browser, or it needs an update. Opens and clicks aren't tracked until it is." },
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

  useEffect(() => {
    const hear = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== "easeus-mail-tracker:here") return;
      const to = typeof e.data.base === "string" ? e.data.base : "";
      setBase(to);
      setState(!to ? "idle" : to === window.location.origin ? "here" : "elsewhere");
    };
    window.addEventListener("message", hear);
    window.postMessage({ type: "easeus-mail-tracker:ping" }, window.location.origin);
    // no answer in two seconds: not installed (or older than 1.0.7)
    const timer = setTimeout(() => setState((s) => (s === "asking" ? "missing" : s)), 2000);
    return () => {
      window.removeEventListener("message", hear);
      clearTimeout(timer);
    };
  }, []);

  if (state === "asking") return null;
  const look = LOOK[state];
  return (
    <Link href="/mail-tracker" title={look.title} className="btn btn-sm btn-glow fade-in inline-flex items-center gap-2">
      <Mail size={14} className="text-sky-400" />
      {look.text(base)}
      <span className={`size-2 shrink-0 rounded-full ${look.dot}`} />
    </Link>
  );
}
