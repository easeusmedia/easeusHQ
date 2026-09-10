"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Native <select> option lists are OS-rendered and can't be restyled (that
// blue hover highlight is Chrome/macOS, not us) — this is a plain button +
// list instead, styled with our own tokens, that still submits like a
// normal form field via a hidden input.
export function Dropdown({
  name,
  defaultValue = "",
  options,
  placeholder = "Select…",
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
      >
        <span className={current ? "text-foreground" : "text-muted"}>{current?.label ?? placeholder}</span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-surface-2 py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.value || "_empty"}
              type="button"
              onClick={() => {
                setValue(o.value);
                setOpen(false);
                onChange?.(o.value);
              }}
              className="block w-full px-2 py-1.5 text-left text-xs text-foreground hover:bg-hover"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
