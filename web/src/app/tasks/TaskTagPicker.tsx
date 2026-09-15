"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createTaskTag } from "./actions";

export type TaskTagOption = { id: string; name: string; clientFacing: boolean };

// Deliberately uncolored. The client tags elsewhere carry a colour because
// there are a handful of them on a page; these sit on every task card at
// once, and colouring them would leave each card a rainbow with nothing to
// separate "what kind of work this is" from the status pill, which is the
// one thing on a card that genuinely needs to catch the eye.
export function TaskTagChip({ name }: { name: string }) {
  return (
    <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{name}</span>
  );
}

// Checkbox list rather than a dropdown: a task is often more than one kind
// of work (a reel that also needs a thumbnail), and the whole set is short
// enough to show at once.
export function TaskTagPicker({
  tags,
  selected,
  internal,
  onInternalHint,
  onChange,
}: {
  tags: TaskTagOption[];
  selected: string[];
  internal: boolean;
  // fired when the picked tags imply a different answer than the current
  // "internal" checkbox — lets the form follow the tag without overriding
  // a deliberate choice
  onInternalHint?: (next: boolean) => void;
  // Two callers, two submit styles. The client task forms post real
  // FormData, so this writes hidden inputs; the work-task dialog calls a
  // server action with its own state, so it passes onChange and gets the
  // ids directly. Given onChange, the hidden inputs are pointless and are
  // left out rather than posted into a form that isn't there.
  onChange?: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // a newly added tag arrives via the reload in add() below, so there is
  // no optimistic local list to merge here
  const all = tags;

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((t) => t !== id) : [...picked, id];
    setPicked(next);
    onChange?.(next);
    // A task tagged only with internal kinds of work (audio engineering,
    // channel management) is internal work; tag it with anything the client
    // receives and it's a deliverable. Suggested from the tags rather than
    // forced, so ops can still override it on the checkbox below.
    if (next.length > 0 && onInternalHint) {
      onInternalHint(next.every((id) => !all.find((t) => t.id === id)?.clientFacing));
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const res = await createTaskTag(name);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    setNewName("");
    setAdding(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-2">
      {!onChange && (
        <>
          {/* one hidden marker so the action can tell "no tag section in
              this form" apart from "every tag was unticked" */}
          <input type="hidden" name="tagsPresent" value="1" />
          {picked.map((id) => (
            <input key={id} type="hidden" name="tagIds" value={id} />
          ))}
          <input type="hidden" name="internal" value={internal ? "on" : ""} />
        </>
      )}

      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`rounded-md border px-2 py-1 text-xs ${
                on ? "border-hover bg-hover text-foreground" : "border-border bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {t.name}
            </button>
          );
        })}
        {adding ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Tag name"
              className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
            />
            <button type="button" onClick={add} className="btn-ghost rounded-md px-2 py-1 text-xs">
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-add flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          >
            <Plus size={11} /> Tag
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
