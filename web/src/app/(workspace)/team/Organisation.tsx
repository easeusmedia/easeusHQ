"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../ConfirmButton";
import { createDepartment, createJobTitle, createWorkTag, deleteDepartment, deleteJobTitle, deleteWorkTag, renameDepartment, renameRole, setDepartmentWords } from "./actions";
import type { Department, Position, WorkTag } from "./PeopleDirectory";
import { closeOnBackdrop } from "../dialog";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

// A button that turns into a field: Enter adds, Escape (or leaving it empty)
// puts the button back. Escape is kept from closing the dialog around it.
function AddInline({ label, onAdd, small }: { label: string; onAdd: (name: string) => Promise<string | undefined>; small?: boolean }) {
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

// A name that turns into a field when clicked: Enter (or leaving it) saves,
// Escape puts it back as it was
function EditableName({ name, onSave, className = "" }: { name: string; onSave: (name: string) => Promise<string | undefined>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!value.trim() || value.trim() === name) {
      setValue(name);
      return setEditing(false);
    }
    setBusy(true);
    const error = await onSave(value);
    setBusy(false);
    if (error) setValue(name);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} title="Rename" className={`group/name flex items-center gap-1.5 rounded-md text-left transition-colors hover:text-foreground ${className}`}>
        {name}
        <Pencil size={11} className="text-muted opacity-0 transition-opacity group-hover/name:opacity-100" />
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setValue(name);
          setEditing(false);
        }
      }}
      className={`w-56 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-foreground outline-none focus:border-hover disabled:opacity-60 ${className}`}
    />
  );
}

// How the agency is laid out: its departments, each with its roles, and each
// role with the kinds of work "Add task" offers for it. Changes save as they're made; the page refreshes once, on closing.
export function Organisation({
  departments,
  positions,
  workTags,
  className,
  children,
}: {
  departments: Department[];
  positions: Position[];
  workTags: WorkTag[];
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [teams, setTeams] = useState(departments);
  const [roles, setRoles] = useState(positions);
  const [tags, setTags] = useState(workTags);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTeams(departments);
    setRoles(positions);
    setTags(workTags);
    setChanged(false);
    setError(null);
    ref.current?.showModal();
  }

  // the reason it wasn't done, shown and handed back so a field stays open
  function fail(message: string) {
    setError(message);
    return message;
  }
  function done() {
    setError(null);
    setChanged(true);
  }

  async function addDepartment(name: string) {
    const res = await createDepartment(name);
    if (res.error || !res.id) return fail(res.error ?? "That department couldn't be added.");
    done();
    setTeams((all) => [...all, { id: res.id!, name: res.name!, slug: res.slug, people: 0 }]);
  }
  async function removeDepartment(id: string) {
    const res = await deleteDepartment(id);
    if (res.error) return setError(res.error);
    done();
    setTeams((all) => all.filter((t) => t.id !== id));
    setRoles((all) => all.filter((r) => r.teamId !== id));
    setTags((all) => all.map((t) => (t.teamId === id ? { ...t, teamId: null } : t)));
  }
  async function addRole(name: string, teamId: string) {
    const res = await createJobTitle(name, teamId);
    if (res.error || !res.id) return fail(res.error ?? "That role couldn't be added.");
    if (res.teamId !== teamId) return fail(`"${res.name}" already exists, under ${teams.find((t) => t.id === res.teamId)?.name ?? "another department"}.`);
    done();
    setRoles((all) => (all.some((r) => r.id === res.id) ? all : [...all, { id: res.id!, name: res.name!, teamId, people: 0, workflow: "todo" }]));
  }
  async function renameTeam(id: string, name: string) {
    const res = await renameDepartment(id, name);
    if (res.error) return fail(res.error);
    done();
    setTeams((all) => all.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
  }
  async function renameOneRole(id: string, name: string) {
    const res = await renameRole(id, name);
    if (res.error) return fail(res.error);
    done();
    setRoles((all) => all.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)));
  }
  async function removeRole(id: string) {
    const res = await deleteJobTitle(id);
    if (res.error) return setError(res.error);
    done();
    setRoles((all) => all.filter((r) => r.id !== id));
    setTags((all) => all.map((t) => (t.roleId === id ? { ...t, roleId: null } : t)));
  }
  async function addKind(name: string, role: Position) {
    const res = await createWorkTag(name, role.teamId!, role.id);
    if (res.error || !res.id) return fail(res.error ?? "That kind of work couldn't be added.");
    done();
    setTags((all) => [...all, { id: res.id!, name: res.name!, teamId: role.teamId, uses: 0, roleId: role.id, workflow: res.workflow }]);
  }
  async function removeKind(id: string) {
    const res = await deleteWorkTag(id);
    if (res.error) return setError(res.error);
    done();
    setTags((all) => all.filter((t) => t.id !== id));
  }

  const kindMessage = (t: WorkTag) =>
    `Remove "${t.name}"?${t.uses ? ` ${t.uses} ${t.uses === 1 ? "task loses it" : "tasks lose it"}; the tasks stay.` : ""}`;
  const roleMessage = (r: Position) => `Remove the role "${r.name}"?${r.people ? ` ${people(r.people)} will lose it.` : ""}`;

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {children}
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        onClose={() => changed && router.refresh()}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[min(44rem,calc(100vh-2rem))] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/80 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold">Departments and roles</h2>
            <p className="mt-0.5 text-xs text-muted">Each department has its roles, and each role its kinds of work: what Add task offers the people who hold it.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          {teams.map((t) => {
            const inTeam = roles.filter((r) => r.teamId === t.id);
            return (
              <section key={t.id} className="rounded-xl border border-border bg-surface-2/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <EditableName name={t.name} onSave={(name) => renameTeam(t.id, name)} className="text-sm font-semibold" />
                    <span className="text-xs text-muted">{people(t.people)}</span>
                  </div>
                  <ConfirmButton
                    confirm="Remove"
                    message={`Remove ${t.name} and its roles? Its kinds of work stay, shared by every department.`}
                    className="rounded-md p-1 text-muted transition-colors hover:text-red-400"
                    onConfirm={() => removeDepartment(t.id)}
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
                {/* the words in a task's title that file it here */}
                <label className="mb-3 flex flex-col gap-1">
                  <span className="text-[11px] text-muted/70">Tasks with these words in their title are filed here</span>
                  <input
                    defaultValue={t.keywords ?? ""}
                    placeholder="edit, reel, thumbnail"
                    onBlur={async (e) => {
                      if (e.target.value === (t.keywords ?? "")) return;
                      const res = await setDepartmentWords(t.id, e.target.value);
                      if (res.error) return setError(res.error);
                      done();
                    }}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-hover"
                  />
                </label>
                <div className="flex flex-col divide-y divide-border/50">
                  {inTeam.map((r) => {
                    return (
                      <div key={r.id} className="group flex flex-col gap-2 py-2.5 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-baseline gap-1.5">
                            <EditableName name={r.name} onSave={(name) => renameOneRole(r.id, name)} className="text-sm" />
                            {r.people > 0 && <span className="text-xs text-muted">{people(r.people)}</span>}
                          </div>
                          <ConfirmButton
                            confirm="Remove"
                            message={roleMessage(r)}
                            className="rounded-md p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 focus-visible:opacity-100"
                            onConfirm={() => removeRole(r.id)}
                          >
                            <X size={12} />
                          </ConfirmButton>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tags
                            .filter((k) => k.roleId === r.id)
                            .map((k) => (
                              <span key={k.id} className="group/k flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-foreground/80">
                                {k.name}
                                <ConfirmButton
                                  confirm="Remove"
                                  message={kindMessage(k)}
                                  className="text-muted opacity-0 transition-opacity group-hover/k:opacity-100 hover:text-red-400 focus-visible:opacity-100"
                                  onConfirm={() => removeKind(k.id)}
                                >
                                  <X size={10} />
                                </ConfirmButton>
                              </span>
                            ))}
                          <AddInline small label="Kind of work" onAdd={(name) => addKind(name, r)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2">
                  <AddInline label="Add role" onAdd={(name) => addRole(name, t.id)} />
                </div>
              </section>
            );
          })}
          <div className="pt-1">
            <AddInline label="Add department" onAdd={addDepartment} />
          </div>
        </div>
        {error && <p className="fade-in px-5 pb-4 text-xs text-red-300">{error}</p>}
      </dialog>
    </>
  );
}
