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
  value: controlled,
  options,
  placeholder = "Select…",
  onChange,
  size = "md",
  pill,
}: {
  name?: string;
  defaultValue?: string;
  // Pass this when the owner decides what's selected — a dialog reusing one
  // dropdown across openings, or a field another field clears. Without it
  // the list keeps showing the last pick after the form behind it has been
  // reset, which reads as selected but submits something else.
  value?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange?: (value: string) => void;
  size?: keyof typeof SIZES;
  // A compact property chip instead of a full-width field: an icon and the
  // value (or the placeholder, quieter, with a dashed edge so an unset one
  // reads as "you can set this" rather than as a value). For forms where
  // most fields are optional and shouldn't each take a row.
  pill?: { icon: React.ReactNode };
}) {
  const s = SIZES[size];
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = (next: string) => {
    if (controlled === undefined) setOwn(next);
  };
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
    <div ref={ref} className={pill ? "relative inline-block" : "relative"}>
      {name && <input type="hidden" name={name} value={value} />}
      {pill ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openList())}
          className={`flex max-w-56 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${
            current
              ? "border-border bg-surface-2 text-foreground hover:border-foreground/30"
              : "border-dashed border-border text-muted hover:border-foreground/30 hover:text-foreground"
          }`}
        >
          <span className="flex shrink-0 opacity-70">{pill.icon}</span>
          <span className="min-w-0 truncate">{current?.label ?? placeholder}</span>
        </button>
      ) : (
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
      )}
      {open && position && (
        // fixed, not absolute: an absolute menu is clipped by whichever
        // scrolling ancestor it happens to sit in (see popover.ts)
        <div
          {...topLayer}
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: pill ? Math.max(position.width, 208) : position.width,
          }}
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
