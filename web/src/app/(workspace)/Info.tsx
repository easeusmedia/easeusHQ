"use client";

import { useCallback, useRef, useState } from "react";
import { Info as InfoIcon } from "lucide-react";
import { topLayer, useCloseOnScroll, usePopover } from "./popover";

// What a number or a type means: an (i) that explains it on hover, focus or
// a tap, in the top layer so nothing crops it
export function Info({ label, text }: { label: string; text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(110);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);
  if (!text) return null;
  const show = () => {
    place(ref.current, { width: 272 });
    setOpen(true);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`What ${label} means`}
        onMouseEnter={show}
        onMouseLeave={close}
        onFocus={show}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) close();
          else show();
        }}
        className="grid size-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
      >
        <InfoIcon size={13} />
      </button>
      {open && position && (
        <div {...topLayer} role="tooltip" style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }} className="pop-in pointer-events-none fixed z-50 m-0 rounded-xl popover px-3.5 py-2.5 text-left text-sm font-normal normal-case shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-0.5 leading-relaxed text-muted">{text}</p>
        </div>
      )}
    </>
  );
}
