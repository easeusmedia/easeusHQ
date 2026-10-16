"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { topLayer, useCloseOnScroll, usePopover } from "./popover";

export const MENU_ITEM = "menu-item px-2.5 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-40";

// A "⋯" button and its menu, drawn in the top layer so no column or
// scroller can crop it. The menu gets `close` to call after a pick.
export function MoreMenu({
  label,
  width = 224,
  height = 240,
  children,
}: {
  label: string;
  width?: number;
  height?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(height);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) return setOpen(false);
          place(trigger.current, { width, align: "end" });
          setOpen(true);
        }}
        className={`grid size-7 place-items-center rounded-lg transition-colors hover:bg-foreground/[0.06] hover:text-foreground ${open ? "bg-foreground/[0.06] text-foreground" : "text-muted"}`}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && position && (
        <div
          {...topLayer}
          role="menu"
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 rounded-xl popover p-1 shadow-lg"
        >
          {children(close)}
        </div>
      )}
    </span>
  );
}
