"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Hash, X } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { chip } from "./chip";
import { TaskTagPicker, type TaskTagOption } from "./TaskTagPicker";
import { topLayer, useCloseOnScroll, usePopover } from "./popover";
import { NEW_PROJECT, NEW_PROJECT_OPTION, type useNewProject } from "./useNewProject";

// The pieces both new-task composers are built from — the board's (client
// work) and My tasks' (everyone's own work) — so the two read and behave as
// one thing: a title, a notes line, and a row of chips you touch only if
// they apply.

// the chip every optional property is drawn as (chip.ts, shared with
// Dropdown and DatePicker so all of them look the same)
export const pill = chip;

// The Project chip: the client's newest few and a search for the rest, with
// "＋ New project" pinned first; picking that turns the chip into a name
// field in place. Enter makes the project (not the task); Escape backs out
// of the name without closing the dialog around it.
export function ProjectChip({
  value,
  onChange,
  projects,
  newProject,
  canCreate,
}: {
  value: string;
  onChange: (projectId: string) => void;
  // this client's projects, newest first
  projects: { id: string; name: string }[];
  newProject: ReturnType<typeof useNewProject>;
  canCreate: boolean;
}) {
  if (!newProject.naming) {
    return (
      <Dropdown
        pill={{ icon: <FolderOpen size={12} className="text-violet-400" /> }}
        value={value}
        placeholder="Project"
        search={{ recent: 3, placeholder: "Find a project…" }}
        options={[...(canCreate ? [NEW_PROJECT_OPTION] : []), ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        onChange={(id) => (id === NEW_PROJECT ? newProject.start() : onChange(id))}
      />
    );
  }
  return (
    <span className={`${pill(true)} gap-1 py-0.5 pr-1`}>
      <FolderOpen size={12} className="shrink-0 text-violet-400" />
      <input
        autoFocus
        value={newProject.name}
        onChange={(e) => newProject.setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            newProject.create();
          } else if (e.key === "Escape") {
            e.preventDefault();
            newProject.cancel();
          }
        }}
        placeholder="New project name"
        aria-label="New project name"
        className="w-36 bg-transparent text-xs text-foreground outline-none! placeholder:text-muted"
      />
      <button
        type="button"
        onClick={newProject.create}
        disabled={newProject.busy || !newProject.name.trim()}
        aria-label="Create project"
        className="btn-ghost flex size-5 items-center justify-center rounded-full disabled:opacity-40"
      >
        <Check size={12} />
      </button>
      <button
        type="button"
        onClick={newProject.cancel}
        aria-label="Cancel new project"
        className="btn-ghost flex size-5 items-center justify-center rounded-full"
      >
        <X size={12} />
      </button>
    </span>
  );
}

// "Type of work" as a chip: the label is what's picked, and the full list of
// tags opens beneath it only when asked for — fourteen chips were a third of
// the old form's height, shown every time whether or not anyone tagged.
export function TagPill({
  tags,
  picked,
  onChange,
  internal,
  onInternalHint,
  canManage = false,
}: {
  tags: TaskTagOption[];
  picked: string[];
  onChange: (ids: string[]) => void;
  internal: boolean;
  onInternalHint?: (internal: boolean) => void;
  // whether this person may add or remove tags themselves (ops)
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(260);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const names = tags.filter((t) => picked.includes(t.id)).map((t) => t.name);
  const label = names.length === 0 ? "Type" : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) return setOpen(false);
          place(triggerRef.current);
          setOpen(true);
        }}
        className={pill(names.length > 0)}
      >
        <Hash size={12} className="shrink-0 text-rose-400" />
        <span className="max-w-40 truncate">{label}</span>
      </button>
      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: 340 }}
          className="pop-in fixed z-50 rounded-xl border border-border bg-surface p-3 shadow-2xl"
        >
          <TaskTagPicker
            tags={tags}
            selected={picked}
            internal={internal}
            onInternalHint={onInternalHint}
            onChange={onChange}
            canManage={canManage}
          />
        </div>
      )}
    </div>
  );
}
