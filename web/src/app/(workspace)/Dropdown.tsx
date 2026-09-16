"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { topLayer, usePopover, useCloseOnScroll } from "./popover";
import { ChevronDown } from "lucide-react";

// Native <select> option lists are OS-rendered and can't be restyled (that
// blue hover highlight is Chrome/macOS, not us) — this is a plain button +
// list instead, styled with our own tokens, that still submits like a
// normal form field via a hidden input.
// "md" matches a text input exactly (same radius, padding and type size), so
// a Project or Assigned-to row in a form lines up with the Title row above
// it instead of sitting shorter and tighter than everything around it.
// "sm" is for the compact places a dropdown rides inside a dense row — a
// table cell, a task card, the sidebar's viewing-as picker.
const SIZES = {
  sm: { trigger: "rounded-md px-2 py-1 text-xs", option: "px-2 py-1.5 text-xs", chevron: 13 },
  md: { trigger: "rounded-lg px-3 py-2 text-sm", option: "px-3 py-2 text-sm", chevron: 15 },
} as const;

export function Dropdown({
  name,
  defaultValue = "",
  options,
  placeholder = "Select…",
  onChange,
  size = "md",
}: {
  name?: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange?: (value: string) => void;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);
  // roughly what the list will render at, for the flip-up check — capped by
  // max-h-80 below
  const listHeight = Math.min(320, options.length * (size === "sm" ? 28 : 36) + 8);
  const { position, place } = usePopover(listHeight);

  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  function openList() {
    place(triggerRef.current);
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        className={`flex w-full items-center justify-between border border-border bg-surface-2 text-left ${s.trigger}`}
      >
        <span className={`min-w-0 truncate ${current ? "text-foreground" : "text-muted"}`}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={s.chevron} className="ml-2 shrink-0 text-muted" />
      </button>
      {open && position && (
        // fixed, not absolute: an absolute menu is clipped by whichever
        // scrolling ancestor it happens to sit in (see popover.ts)
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 max-h-80 overflow-y-auto rounded-md border border-border bg-surface-2 py-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.value || "_empty"}
              type="button"
              onClick={() => {
                setValue(o.value);
                setOpen(false);
                onChange?.(o.value);
              }}
              className={`block w-full text-left text-foreground hover:bg-hover ${s.option}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
