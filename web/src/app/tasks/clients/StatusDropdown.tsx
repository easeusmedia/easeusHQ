"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { updateClientStatus } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  current: "Current",
  on_hold: "On hold",
  previous: "Previous",
};

const STATUS_STYLE: Record<string, string> = {
  current: "bg-green-400/15 text-green-300 border-green-400/30",
  on_hold: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  previous: "bg-surface text-muted border-border",
};

const OPTIONS = ["current", "on_hold", "previous"];

// One dropdown, used both in the client list (change status without
// opening the client) and on the client's own page — same component,
// same behavior, so status always changes the same way everywhere.
export function StatusDropdown({ clientId, status, size = "sm" }: { clientId: string; status: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function pick(next: string) {
    setOpen(false);
    if (next === status) return;
    setPending(true);
    await updateClientStatus(clientId, next);
    setPending(false);
    router.refresh();
  }

  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";

  return (
    // preventDefault, not just stopPropagation — this sits inside a Link
    // in the client list, and stopPropagation alone doesn't stop the
    // browser's own default "follow this anchor" behavior, only React's
    // event bubbling to Link's own handler. Without preventDefault the
    // click still silently navigated to the client page underneath.
    <div
      ref={ref}
      className="relative shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`status-pop flex items-center gap-1 rounded-full border font-medium disabled:opacity-60 ${pad} ${STATUS_STYLE[status]}`}
      >
        {STATUS_LABEL[status] ?? status}
        <ChevronDown size={size === "sm" ? 11 : 13} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md border border-border bg-surface-2 p-1 shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => pick(o)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-hover"
            >
              {STATUS_LABEL[o]}
              {o === status && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
