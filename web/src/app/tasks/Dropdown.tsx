"use client";

import { useEffect, useRef, useState } from "react";
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
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);
  const LIST_HEIGHT = 320; // matches max-h-80 below

  function openList() {
    // flip upward when the list wouldn't fit under the trigger (e.g. this
    // dropdown sits near the bottom of the viewport) — otherwise it renders
    // straight down and off-screen, forcing a page scroll to reach it
    const rect = ref.current?.getBoundingClientRect();
    setOpenUpward(!!rect && window.innerHeight - rect.bottom < LIST_HEIGHT && rect.top > LIST_HEIGHT);
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        className={`flex w-full items-center justify-between border border-border bg-surface-2 text-left ${s.trigger}`}
      >
        <span className={`min-w-0 truncate ${current ? "text-foreground" : "text-muted"}`}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={s.chevron} className="ml-2 shrink-0 text-muted" />
      </button>
      {open && (
        <div
          className={`pop-in absolute z-20 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-surface-2 py-1 shadow-lg ${
            openUpward ? "bottom-full mb-1" : "mt-1"
          }`}
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
