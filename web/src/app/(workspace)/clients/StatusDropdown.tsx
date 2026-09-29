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

// the quiet version's dot: green for current, amber on hold, grey before
const STATUS_DOT: Record<string, string> = {
  current: "bg-emerald-400",
  on_hold: "bg-amber-400",
  previous: "bg-white/30",
};

const OPTIONS = ["current", "on_hold", "previous"];

// One dropdown, used both in the client list (change status without
// opening the client) and on the client's own page — same component,
// same behavior, so status always changes the same way everywhere.
export function StatusDropdown({
  clientId,
  status,
  size = "sm",
  quiet = false,
  onChange,
}: {
  clientId: string;
  status: string;
  size?: "sm" | "md";
  // a dot and a word instead of a coloured pill — for the client cards
  quiet?: boolean;
  // the client list already has its own optimistic state (shared with
  // drag-and-drop) — when given, this drives that instead of calling
  // updateClientStatus/router.refresh() itself, so a pick from the
  // dropdown and a drag land the same way.
  onChange?: (id: string, next: string) => void;
}) {
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
    if (onChange) return onChange(clientId, next);
    setPending(true);
    await updateClientStatus(clientId, next);
    setPending(false);
    router.refresh();
  }

  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs";

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
        className={
          quiet
            ? "group/status flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted transition-colors duration-200 hover:bg-white/[0.05] hover:text-foreground disabled:opacity-60"
            : `status-pop flex items-center gap-1 rounded-full border font-medium disabled:opacity-60 ${pad} ${STATUS_STYLE[status]}`
        }
      >
        {quiet && <span className={`size-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.previous}`} />}
        {STATUS_LABEL[status] ?? status}
        <ChevronDown
          size={size === "sm" ? 11 : 13}
          className={quiet ? "opacity-0 transition-opacity duration-200 group-hover/status:opacity-100" : undefined}
        />
      </button>
      {open && (
        <div className={`pop-in absolute top-full z-20 mt-1 w-36 rounded-xl popover p-1 ${quiet ? "right-0" : "left-0"}`}>
          {OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => pick(o)}
              className="menu-item justify-between px-2.5 py-1.5 text-xs"
            >
              {STATUS_LABEL[o]}
              {o === status && <Check size={13} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
