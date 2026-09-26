"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Building2, CalendarClock, Check, FolderOpen, Hash, Link2, MoreHorizontal, Plus, User, X } from "lucide-react";
import { createTask, type TaskFormState } from "./actions";
import { NEW_PROJECT, NEW_PROJECT_OPTION, useNewProject } from "./useNewProject";
import { Dropdown } from "./Dropdown";
import { DatePicker } from "./DatePicker";
import { TaskTagPicker, type TaskTagOption } from "./TaskTagPicker";
import { Checkbox } from "./Checkbox";
import { Reveal } from "./Reveal";
import { topLayer, useCloseOnScroll, usePopover } from "./popover";

type Project = { id: string; name: string; client: { id: string; name: string } };
type Editor = { id: string; name: string };

const initialState: TaskFormState = {};


// the chip every optional property is drawn as, set or not
const pill = (set: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${
    set
      ? "border-border bg-surface-2 text-foreground hover:border-foreground/30"
      : "border-dashed border-border text-muted hover:border-foreground/30 hover:text-foreground"
  }`;

// A composer, not a form. What a task almost always is — a title and a
// client — is the whole of what's asked for up front; every other property
// is a chip you touch only if it applies, and the rarely-used ones (raw
// footage, a scheduled reveal, internal-only) wait behind "⋯". It used to
// lay out nine fields and every tag at once for what is usually "this video,
// this client, this editor".
export function NewTaskRow({
  projects,
  editors,
  defaultProjectId,
  taskTags = [],
  canCreateProject = true,
}: {
  projects: Project[];
  editors: Editor[];
  taskTags?: TaskTagOption[];
  // only ops can make a project; an editor isn't offered what would refuse them
  canCreateProject?: boolean;
  // pre-picks the project when this is embedded on that project's own page,
  // so adding a task there doesn't mean hunting it back out of the list
  defaultProjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(createTask, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const preset = projects.find((p) => p.id === defaultProjectId);
  const blank = useCallback(
    () => ({
      title: "",
      notes: "",
      clientId: preset?.client.id ?? "",
      projectId: defaultProjectId ?? "",
      // an editor's only choice is themselves, so it's already made
      assignedToId: editors.length === 1 ? editors[0].id : "",
      dueDate: "",
      scheduledFor: "",
      rawLink: "",
      tagIds: [] as string[],
      internal: false,
    }),
    [preset, defaultProjectId, editors]
  );
  const [f, setF] = useState(blank);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setF((cur) => ({ ...cur, ...patch }));
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState<"title" | "client" | null>(null);

  const clients = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.client.id, p.client.name]));
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);
  const newProject = useNewProject(f.clientId, (id) => set({ projectId: id }));
  const clientProjects = newProject.withMade(projects).filter((p) => p.client.id === f.clientId);

  // once it lands: close, and start the next one from nothing
  useEffect(() => {
    if (!state.success) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the composer is a reaction to the task landing, not a render loop
    setF(blank());
    setMore(false);
    newProject.cancel();
    dialogRef.current?.close();
  }, [state.success, blank]);

  // Built by hand rather than read off the DOM: most of what's picked lives
  // in chips and popovers, not form controls, and a popover that has closed
  // has taken its inputs with it.
  function submit() {
    if (!f.title.trim()) {
      setProblem("title");
      titleRef.current?.focus();
      return;
    }
    if (!f.clientId) return setProblem("client");
    setProblem(null);
    const data = new FormData();
    data.set("title", f.title);
    data.set("clientId", f.clientId);
    data.set("projectId", f.projectId);
    data.set("assignedToId", f.assignedToId);
    data.set("dueDate", f.dueDate);
    data.set("scheduledFor", f.scheduledFor);
    data.set("rawLink", f.rawLink);
    data.set("editingNotes", f.notes);
    data.set("tagsPresent", "1");
    for (const id of f.tagIds) data.append("tagIds", id);
    if (f.internal) data.set("internal", "on");
    startTransition(() => formAction(data));
  }

  const error =
    problem === "title"
      ? "Give it a title."
      : problem === "client"
        ? "Pick the client it's for."
        : newProject.error ?? state.error ?? null;
  const hidden = [f.rawLink, f.scheduledFor, f.internal].filter(Boolean).length;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="btn btn-add flex w-full items-center justify-center gap-1.5"
      >
        <Plus size={15} /> New task
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        // centred like every other dialog here; opening "⋯" eases it taller
        // and it re-centres as it grows, rather than jumping
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={(e) => {
            // ⌘↵ from anywhere, including the notes
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className="flex flex-col"
        >
          {/* borderless, so no focus ring: the caret already says where you
              are, and a box drawn round a field that has no box looks like a
              mistake. `outline-none!` because the app's global :focus-visible
              rule is unlayered and would otherwise win over a utility. */}
          <div className="flex flex-col gap-1.5 px-5 pt-5">
            <input
              ref={titleRef}
              value={f.title}
              onChange={(e) => {
                set({ title: e.target.value });
                if (problem === "title") setProblem(null);
              }}
              placeholder="What needs editing?"
              aria-label="Title"
              autoFocus
              className="w-full bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60"
            />
            <textarea
              value={f.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Notes for the editor…"
              aria-label="Editing notes"
              rows={1}
              className="field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent text-sm text-foreground/90 outline-none! placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-5 pt-5 pb-4">
            <span className={`rounded-full ${problem === "client" ? "ring-1 ring-red-400/60" : ""}`}>
              <Dropdown
                pill={{ icon: <Building2 size={12} /> }}
                value={f.clientId}
                placeholder="Client"
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(id) => {
                  // the old project belonged to the old client
                  set({ clientId: id, projectId: "" });
                  newProject.cancel();
                  if (problem === "client") setProblem(null);
                }}
              />
            </span>
            {/* Once there's a client: pick one of theirs, or start a new one
                right here. Left alone, the task files under the client's
                catch-all project. */}
            {f.clientId &&
              (!newProject.naming ? (
                <Dropdown
                  pill={{ icon: <FolderOpen size={12} /> }}
                  value={f.projectId}
                  placeholder="Project"
                  search={{ recent: 3, placeholder: "Find a project…" }}
                  // first, not last: under a client's twenty-odd projects the
                  // bottom of the list is below the scroll, i.e. hidden
                  options={[
                    ...(canCreateProject ? [NEW_PROJECT_OPTION] : []),
                    ...clientProjects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  onChange={(id) => (id === NEW_PROJECT ? newProject.start() : set({ projectId: id }))}
                />
              ) : (
                <span className={`${pill(true)} gap-1 py-0.5 pr-1`}>
                  <FolderOpen size={12} className="shrink-0 opacity-70" />
                  <input
                    autoFocus
                    value={newProject.name}
                    onChange={(e) => newProject.setName(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter makes the project, not the task; Escape backs
                      // out of the name without closing the whole dialog
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
              ))}
            {editors.length > 1 && (
              <Dropdown
                pill={{ icon: <User size={12} /> }}
                value={f.assignedToId}
                placeholder="Assignee"
                options={editors.map((e) => ({ value: e.id, label: e.name }))}
                onChange={(id) => set({ assignedToId: id })}
              />
            )}
            <DatePicker pill={{}} value={f.dueDate} onChange={(v) => set({ dueDate: v })} placeholder="Due" />
            {taskTags.length > 0 && (
              <TagPill
                tags={taskTags}
                picked={f.tagIds}
                onChange={(ids) => set({ tagIds: ids })}
                internal={f.internal}
                onInternalHint={(v) => set({ internal: v })}
              />
            )}
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-label="More options"
              className={`${pill(more || hidden > 0)} px-2`}
            >
              <MoreHorizontal size={13} />
              {/* so something set back there isn't forgotten once it's closed */}
              {!more && hidden > 0 && <span className="tabular-nums">{hidden}</span>}
            </button>
          </div>

          <Reveal open={more}>
            <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
              <label className={`${pill(!!f.rawLink)} min-w-0 cursor-text`}>
                <Link2 size={12} className="shrink-0 opacity-70" />
                <input
                  value={f.rawLink}
                  onChange={(e) => set({ rawLink: e.target.value })}
                  placeholder="Raw footage link"
                  aria-label="Raw footage link"
                  className="w-40 bg-transparent text-xs text-foreground outline-none! placeholder:text-muted"
                />
              </label>
              <DatePicker
                pill={{ icon: <CalendarClock size={12} /> }}
                value={f.scheduledFor}
                onChange={(v) => set({ scheduledFor: v })}
                placeholder="Hide until…"
              />
              <label className={`${pill(f.internal)} cursor-pointer`}>
                <Checkbox checked={f.internal} onChange={(v) => set({ internal: v })} label="Internal work" size={13} />
                Internal
              </label>
            </div>
          </Reveal>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            {/* only ever says something when something's wrong */}
            <p className="min-w-0 truncate text-xs text-red-300">{error}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
                Cancel
              </button>
              <button disabled={pending} className="btn btn-glow disabled:opacity-60">
                {pending ? "Adding…" : "Add task"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

// "Type of work" as a chip: the label is what's picked, and the full list of
// tags opens beneath it only when asked for — fourteen chips were a third of
// the old form's height, shown every time whether or not anyone tagged.
function TagPill({
  tags,
  picked,
  onChange,
  internal,
  onInternalHint,
}: {
  tags: TaskTagOption[];
  picked: string[];
  onChange: (ids: string[]) => void;
  internal: boolean;
  onInternalHint: (internal: boolean) => void;
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
        <Hash size={12} className="shrink-0 opacity-70" />
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
          />
        </div>
      )}
    </div>
  );
}
