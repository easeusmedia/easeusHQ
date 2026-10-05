"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { readConsent, saveConsent, type Consent } from "@/lib/consent";

// The first-visit cookie notice, on every page (the team's and the client's):
// what the app keeps and why, and a choice. Once chosen, it stays gone for a
// year. Shown only after mount, so the server never renders it for someone
// who has already chosen.
export function CookieNotice() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // the look of the page it sits over (the app or sign-in), followed live
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (readConsent()) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const page = document.querySelector(".app-root, .login-root");
    if (!page) return;
    const read = () => setTheme(page.getAttribute("data-theme"));
    read();
    const watch = new MutationObserver(read);
    watch.observe(page, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, [open]);

  function choose(c: Consent) {
    saveConsent(c);
    setLeaving(true);
    setTimeout(() => setOpen(false), 300);
  }

  if (!open) return null;
  return (
    <div data-theme={theme ?? undefined} className="contents">
    <div
      role="dialog"
      aria-label="Cookies"
      className={`panel float-panel fixed bottom-4 right-4 z-[70] w-[min(24rem,calc(100vw-2rem))] rounded-2xl p-5 transition-[opacity,translate] duration-300 ease-out ${
        leaving ? "translate-y-2 opacity-0" : "rise-in"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="badge flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Cookie size={16} />
        </span>
        <p className="text-sm font-medium">We use cookies</p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Essential cookies keep you signed in and your account secure. With your permission, we also remember your
        preferences, such as your sidebar layout, so everything is just as you left it.{" "}
        <Link href="/privacy#cookies" className="text-foreground/80 underline-offset-2 hover:underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => choose("essential")} className="btn btn-sm btn-ghost">
          Essential only
        </button>
        <button type="button" onClick={() => choose("all")} className="btn btn-sm btn-glow">
          Accept all
        </button>
      </div>
    </div>
    </div>
  );
}
