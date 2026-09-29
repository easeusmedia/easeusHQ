"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../ConfirmButton";
import { createDepartment, createJobTitle, createWorkTag, deleteDepartment, deleteJobTitle, deleteWorkTag } from "./actions";
import type { Department, Position, WorkTag } from "./PeopleDirectory";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

// A button that turns into a field: Enter adds, Escape (or leaving it empty)
// puts the button back. Escape is kept from closing the dialog around it.
function AddInline({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<string | undefined> }) {
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

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted transition-colors hover:border-hover hover:text-foreground">
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
      className="w-48 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:border-hover disabled:opacity-60"
    />
  );
}

// A labelled row of removable chips, with a way to add another.
function ChipRow({
  label,
  items,
  count,
  confirm,
  onRemove,
  add,
  onAdd,
}: {
  label: string;
  items: { id: string; name: string }[];
  // the small number beside a chip, when there's one worth showing
  count: (id: string) => number;
  confirm: (item: { id: string; name: string }) => string;
  onRemove: (id: string) => void;
  add: string;
  onAdd: (name: string) => Promise<string | undefined>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-muted/70">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((t) => (
          <span key={t.id} className="group flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs">
            {t.name}
            {count(t.id) > 0 && <span className="text-muted">{count(t.id)}</span>}
            <ConfirmButton
              confirm="Remove"
              message={confirm(t)}
              className="text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 focus-visible:opacity-100"
              onConfirm={() => onRemove(t.id)}
            >
              <X size={11} />
            </ConfirmButton>
          </span>
        ))}
        <AddInline label={add} onAdd={onAdd} />
      </div>
    </div>
  );
}

// How the agency is laid out: its departments, and in each the positions
// people hold and the work tags its tasks are labelled with. Leadership
// titles (no department) span the whole company. Changes save as they're
// made and are kept here; the page refreshes once, on closing.
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
  const [titles, setTitles] = useState(positions);
  const [tags, setTags] = useState(workTags);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTeams(departments);
    setTitles(positions);
    setTags(workTags);
    setChanged(false);
    setError(null);
    ref.current?.showModal();
  }

  // the reason it wasn't added, shown and handed back so the field stays open
  function fail(message: string) {
    setError(message);
    return message;
  }

  async function addPosition(name: string, teamId: string | null) {
    const res = await createJobTitle(name, teamId);
    if (res.error || !res.id) return fail(res.error ?? "That position couldn't be added.");
    if (res.teamId !== teamId) return fail(`"${res.name}" already exists, under ${teams.find((t) => t.id === res.teamId)?.name ?? "Leadership"}.`);
    setError(null);
    setChanged(true);
    setTitles((all) => (all.some((t) => t.id === res.id) ? all : [...all, { id: res.id!, name: res.name!, teamId, people: 0 }]));
  }

  async function removePosition(id: string) {
    const res = await deleteJobTitle(id);
    if (res.error) return setError(res.error);
    setChanged(true);
    setTitles((all) => all.filter((t) => t.id !== id));
  }

  async function addTag(name: string, teamId: string) {
    const res = await createWorkTag(name, teamId);
    if (res.error || !res.id) return fail(res.error ?? "That work tag couldn't be added.");
    setError(null);
    setChanged(true);
    setTags((all) => [...all, { id: res.id!, name: res.name!, teamId, uses: 0 }]);
  }

  async function removeTag(id: string) {
    const res = await deleteWorkTag(id);
    if (res.error) return setError(res.error);
    setChanged(true);
    setTags((all) => all.filter((t) => t.id !== id));
  }

  async function addDepartment(name: string) {
    const res = await createDepartment(name);
    if (res.error || !res.id) return fail(res.error ?? "That department couldn't be added.");
    setError(null);
    setChanged(true);
    setTeams((all) => [...all, { id: res.id!, name: res.name!, slug: res.slug, people: 0 }]);
  }

  async function removeDepartment(id: string) {
    const res = await deleteDepartment(id);
    if (res.error) return setError(res.error);
    setChanged(true);
    setTeams((all) => all.filter((t) => t.id !== id));
    setTitles((all) => all.filter((t) => t.teamId !== id));
    setTags((all) => all.map((t) => (t.teamId === id ? { ...t, teamId: null } : t)));
  }

  const holders = (id: string) => titles.find((t) => t.id === id)?.people ?? 0;
  const uses = (id: string) => tags.find((t) => t.id === id)?.uses ?? 0;
  const positionMessage = (t: { id: string; name: string }) =>
    `Remove the position "${t.name}"?${holders(t.id) ? ` ${people(holders(t.id))} will have no position; their access and department stay as they are.` : ""}`;
  const tagMessage = (t: { id: string; name: string }) =>
    `Remove the work tag "${t.name}"?${uses(t.id) ? ` ${uses(t.id)} ${uses(t.id) === 1 ? "task loses it" : "tasks lose it"}; the tasks stay.` : ""}`;
  const shared = tags.filter((t) => !t.teamId);

  const sections = [
    { id: null, name: "Leadership", note: "Spans the whole company", removable: false },
    ...teams.map((t) => ({ id: t.id, name: t.name, note: people(t.people), removable: t.slug !== "operations" && t.people === 0 })),
  ];

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {children}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        onClose={() => changed && router.refresh()}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[min(40rem,calc(100vh-2rem))] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Departments</h2>
            <p className="mt-0.5 text-xs text-muted">
              Each position belongs to a department, and whoever holds it sits there. Work tags are what that department&apos;s tasks can be labelled with. Leadership positions span the whole company.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col divide-y divide-border">
          {sections.map((s) => (
            <section key={s.id ?? "leadership"} className="px-5 py-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {s.name} <span className="ml-1 text-xs font-normal text-muted">{s.note}</span>
                </p>
                {s.removable && (
                  <ConfirmButton
                    confirm="Remove"
                    message={`Remove the ${s.name} department and its positions? Its work tags stay, shared by every department.`}
                    className="rounded-md p-1 text-muted transition-colors hover:text-red-400"
                    onConfirm={() => removeDepartment(s.id!)}
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <ChipRow
                  label="Positions"
                  items={titles.filter((t) => t.teamId === s.id)}
                  count={holders}
                  confirm={positionMessage}
                  onRemove={removePosition}
                  add="Add position"
                  onAdd={(name) => addPosition(name, s.id)}
                />
                {s.id && (
                  <ChipRow
                    label="Work tags"
                    items={tags.filter((t) => t.teamId === s.id)}
                    count={() => 0}
                    confirm={tagMessage}
                    onRemove={removeTag}
                    add="Add work tag"
                    onAdd={(name) => addTag(name, s.id!)}
                  />
                )}
              </div>
            </section>
          ))}
          {/* from before tags belonged to a department, or a removed one's */}
          {shared.length > 0 && (
            <section className="px-5 py-4">
              <p className="mb-2.5 text-sm font-medium">
                Every department <span className="ml-1 text-xs font-normal text-muted">Offered to everyone</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {shared.map((t) => (
                  <span key={t.id} className="group flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs">
                    {t.name}
                    <ConfirmButton
                      confirm="Remove"
                      message={tagMessage(t)}
                      className="text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 focus-visible:opacity-100"
                      onConfirm={() => removeTag(t.id)}
                    >
                      <X size={11} />
                    </ConfirmButton>
                  </span>
                ))}
              </div>
            </section>
          )}
          <div className="px-5 py-4">
            <AddInline label="Add department" onAdd={addDepartment} />
          </div>
        </div>
        {error && <p className="fade-in px-5 pb-4 text-xs text-red-300">{error}</p>}
      </dialog>
    </>
  );
}
