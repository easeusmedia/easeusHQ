"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createTaskTag, deleteTaskTag } from "./actions";
import { ConfirmButton } from "./ConfirmButton";

// group: the department it belongs to; none means every department's
export type TaskTagOption = { id: string; name: string; clientFacing: boolean; group?: string | null };

// Deliberately uncolored. The client tags elsewhere carry a colour because
// there are a handful of them on a page; these sit on every task card at
// once, and colouring them would leave each card a rainbow with nothing to
// separate "what kind of work this is" from the status pill, which is the
// one thing on a card that genuinely needs to catch the eye.
export function TaskTagChip({ name }: { name: string }) {
  return (
    <span className="whitespace-nowrap rounded border border-border/60 bg-surface-2/60 px-1.5 text-[10.5px] leading-4 text-muted">{name}</span>
  );
}

// The kinds of work, shown at once (the set is short). One per task: a task
// is one specific piece of work, so picking a kind replaces the last, and
// picking it again clears it.
export function TaskTagPicker({
  tags,
  selected,
  internal,
  onInternalHint,
  onChange,
  canManage = false,
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
  // whether this viewer may curate the list itself. Core members own their
  // own team's vocabulary; everyone else just picks from it.
  canManage?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [adding, setAdding] = useState(false);
  // Deleting a tag is its own mode, behind "Edit tags". Its × used to sit on
  // every chip, where it read as "unselect" — and pressing it deleted the tag
  // from every task and file that had it.
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // added and removed here, shown at once rather than after reloading the
  // page; the page's own refresh brings them in with the rest
  const [added, setAdded] = useState<TaskTagOption[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const all = [...tags, ...added.filter((a) => !tags.some((t) => t.id === a.id))].filter((t) => !removed.includes(t.id));
  // listed under their department once there's more than one
  const groups = [...new Set(all.map((t) => t.group ?? null))];

  function toggle(id: string) {
    const next = picked.includes(id) ? [] : [id];
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

  async function remove(id: string) {
    const res = await deleteTaskTag(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPicked((p) => p.filter((x) => x !== id));
    setRemoved((r) => [...r, id]);
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
    if (res.tag) setAdded((a) => [...a, res.tag!]);
  }

  function chip(t: TaskTagOption) {
    const on = picked.includes(t.id);
    return (
      <span
        key={t.id}
        className={`group/tag flex items-center rounded-md border text-xs ${
          on ? "border-hover bg-hover text-foreground" : "border-border bg-surface-2 text-muted"
        }`}
      >
        <button
          type="button"
          onClick={() => !managing && toggle(t.id)}
          className={`px-2 py-1 ${managing ? "cursor-default" : "hover:text-foreground"}`}
        >
          {t.name}
        </button>
        {canManage && managing && (
          <ConfirmButton
            confirm="Delete"
            message={`Delete the tag "${t.name}" everywhere? Every task and file tagged with it loses the tag. This can't be undone.`}
            className="pr-1.5 text-muted hover:text-red-400"
            onConfirm={() => remove(t.id)}
          >
            <X size={11} aria-label={`Delete the tag ${t.name}`} />
          </ConfirmButton>
        )}
      </span>
    );
  }

  const addControl = adding ? (
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
  );

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

      {groups.map((g, i) => (
        <div key={g ?? "every"} className="flex flex-col gap-1.5">
          {groups.length > 1 && <p className="text-[11px] font-medium text-muted/70">{g ?? "Every department"}</p>}
          <div className="flex flex-wrap gap-1.5">
            {all.filter((t) => (t.group ?? null) === g).map(chip)}
            {/* adding goes at the end of the list */}
            {i === groups.length - 1 && addControl}
          </div>
        </div>
      ))}
      {groups.length === 0 && <div className="flex flex-wrap gap-1.5">{addControl}</div>}
      {canManage && (
        <button
          type="button"
          onClick={() => setManaging((m) => !m)}
          className="self-start text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          {managing ? "Done editing" : "Edit tags"}
        </button>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
