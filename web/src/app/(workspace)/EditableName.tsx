"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

// Clicks inside a card or link must not open or follow it
const keep = (e: React.SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

// A name with a pencil beside it: click it and it becomes a field. Enter (or
// leaving it) saves, Escape puts it back. onSave returns an error to show,
// or nothing. The pencil shows always (where renaming is the point) or only
// on hover (in dense lists).
export function EditableName({
  name,
  onSave,
  className = "",
  pencil = "always",
  readOnly = false,
}: {
  name: string;
  onSave: (name: string) => Promise<string | undefined>;
  className?: string;
  pencil?: "always" | "hover";
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the name just saved, shown until the page brings it back
  const [saved, setSaved] = useState<{ from: string; to: string } | null>(null);
  if (saved && saved.from !== name) setSaved(null);
  const shown = saved?.to ?? name;

  async function save() {
    const next = value.trim();
    if (!next || next === shown) {
      setValue(shown);
      return setEditing(false);
    }
    setBusy(true);
    let err: string | undefined;
    try {
      err = await onSave(next);
    } catch {
      err = "That name couldn't be saved. Check your connection and try again.";
    }
    setBusy(false);
    if (err) {
      setError(err);
      setValue(name);
    } else setSaved({ from: name, to: next });
    setEditing(false);
  }

  if (readOnly) return <span className={className}>{shown}</span>;

  if (!editing) {
    return (
      <span className="inline-flex max-w-full min-w-0 flex-col">
        <button
          type="button"
          onClick={(e) => {
            keep(e);
            setError(null);
            // start from the name as it is now (a rename elsewhere may have landed)
            setValue(shown);
            setEditing(true);
          }}
          title="Rename"
          aria-label={`Rename ${shown}`}
          className={`group/name inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md text-left transition-colors hover:text-foreground ${className}`}
        >
          <span className="truncate">{shown}</span>
          <Pencil
            size={11}
            className={`shrink-0 text-muted transition-opacity ${pencil === "always" ? "opacity-45 group-hover/name:opacity-100" : "opacity-0 group-hover/name:opacity-100"}`}
          />
        </button>
        {error && (
          <span role="alert" className="fade-in text-[11px] font-normal text-red-300">
            {error}
          </span>
        )}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      disabled={busy}
      onClick={keep}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setValue(name);
          setEditing(false);
        }
      }}
      className={`w-full min-w-24 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-foreground outline-none focus:border-hover disabled:opacity-60 ${className}`}
    />
  );
}

// A button that turns into a field: Enter adds, Escape (or leaving it empty)
// puts the button back. Escape is kept from closing the dialog around it.
export function AddInline({ label, onAdd, small }: { label: string; onAdd: (name: string) => Promise<string | undefined>; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return setOpen(false);
    setBusy(true);
    const error = await onAdd(name);
    setBusy(false);
    if (!error) {
      setName("");
      setOpen(false);
    }
  }

  const size = small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`flex items-center gap-1 rounded-full border border-dashed border-border text-muted transition-colors hover:border-hover hover:text-foreground ${size}`}>
        <Plus size={11} /> {label}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={name}
      disabled={busy}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => !name.trim() && setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          add();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setName("");
          setOpen(false);
        }
      }}
      placeholder={`${label}, then Enter`}
      className={`w-48 rounded-full border border-border bg-surface-2 text-foreground outline-none focus:border-hover disabled:opacity-60 ${size}`}
    />
  );
}
