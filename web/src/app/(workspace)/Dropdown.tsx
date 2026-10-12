"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { topLayer, usePopover, useCloseOnScroll } from "./popover";
import { Check, ChevronDown } from "lucide-react";
import { pickList, type PickOption } from "@/lib/pickList";
import { chip } from "./chip";

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
  search,
  create = false,
}: {
  name?: string;
  defaultValue?: string;
  // Pass this when the owner decides what's selected — a dialog reusing one
  // dropdown across openings, or a field another field clears. Without it
  // the list keeps showing the last pick after the form behind it has been
  // reset, which reads as selected but submits something else.
  value?: string;
  // pinned: always listed first, never filtered or counted (e.g. "＋ New")
  options: PickOption[];
  placeholder?: string;
  onChange?: (value: string) => void;
  size?: keyof typeof SIZES;
  // A compact property chip instead of a full-width field: an icon and the
  // value (or the placeholder, quieter, with a dashed edge so an unset one
  // reads as "you can set this" rather than as a value). For forms where
  // most fields are optional and shouldn't each take a row.
  pill?: { icon: React.ReactNode };
  // For a list that grows without end (a client's projects): only the first
  // `recent` entries are listed — the caller orders them newest first — with
  // a search box above that reaches all the rest. Most of the time the thing
  // wanted is one of the last few; the list shouldn't make you scroll past
  // years of others to prove it.
  search?: { recent: number; placeholder?: string };
  // A list you can add to (a project's type): whatever's typed in the search
  // that isn't already an option can be picked as a new one, and onChange
  // gets the typed text as the value.
  create?: boolean;
}) {
  const s = SIZES[size];
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = (next: string) => {
    if (controlled === undefined) setOwn(next);
  };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // how many past the recent few "Show more" has revealed
  const [more, setMore] = useState(0);
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

  // what's listed: everything, or — for a list that grows without end — the
  // newest few and a search for the rest (lib/pickList, tested there)
  const { shown, matches, searching, older } = pickList(
    options,
    value,
    create ? { recent: 8, ...search, always: true } : search,
    query,
    more
  );
  const q = query.trim();
  const addable = create && q && !options.some((o) => o.label.toLowerCase() === q.toLowerCase());
  // roughly what the list will render at, for the flip-up check — capped by
  // max-h-80 below
  const headings = new Set(shown.map((o) => o.group).filter(Boolean)).size;
  const listHeight = Math.min(320, (shown.length + headings + (searching ? 2 : 0)) * (size === "sm" ? 28 : 36) + 8);
  const { position, place } = usePopover(listHeight);

  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  function openList() {
    setQuery("");
    setMore(0);
    // never narrower than a readable option, however narrow the field
    place(triggerRef.current, { width: pill ? 208 : 200 });
    setOpen(true);
  }

  function pick(v: string) {
    setValue(v);
    setOpen(false);
    onChange?.(v);
  }

  return (
    <div ref={ref} className={pill ? "relative inline-block" : "relative"}>
      {name && <input type="hidden" name={name} value={value} />}
      {pill ? (
        <button
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          type="button"
          onClick={() => (open ? setOpen(false) : openList())}
          className={`max-w-56 ${chip(!!current)}`}
        >
          <span className="flex shrink-0">{pill.icon}</span>
          <span className="min-w-0 truncate">{current?.label ?? placeholder}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={open}
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
            width: position.width,
          }}
          className="pop-in fixed z-50 max-h-80 overflow-y-auto rounded-xl popover p-1 shadow-lg"
        >
          {searching && (
            <div className="px-1 pt-1 pb-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter takes the first match; Escape closes the list, not
                  // the dialog the list is sitting in
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (matches[0]) pick(matches[0].value);
                    else if (addable) pick(q);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder={search?.placeholder ?? "Search…"}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none! placeholder:text-muted"
              />
            </div>
          )}
          {shown.map((o, i) => (
            <Fragment key={o.value || "_empty"}>
              {o.group && o.group !== shown[i - 1]?.group && (
                <p className="px-2.5 pt-2.5 pb-1 text-[12px] font-medium text-muted/70">{o.group}</p>
              )}
              <button type="button" onClick={() => pick(o.value)} className={`menu-item ${s.option}`}>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && o.value !== "" && <Check size={13} className="shrink-0 text-accent" />}
              </button>
            </Fragment>
          ))}
          {addable && (
            <button
              type="button"
              onClick={() => pick(q)}
              className={`menu-item ${s.option}`}
            >
              <span className="min-w-0 truncate">
                <span className="text-muted">＋ Add</span> “{q}”
              </span>
            </button>
          )}
          {searching && q && matches.length === 0 && !addable && (
            <p className={`text-muted ${s.option}`}>No matches</p>
          )}
          {older > 0 && (
            // ten more at a time — a client with a thousand projects shouldn't
            // unfold all of them at once; the search is there for far back
            <button
              type="button"
              onClick={() => setMore((m) => m + 10)}
              className={`menu-item text-xs text-muted ${s.option}`}
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
