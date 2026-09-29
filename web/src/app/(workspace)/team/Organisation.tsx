"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../ConfirmButton";
import { createDepartment, createJobTitle, deleteDepartment, deleteJobTitle } from "./actions";
import type { Department, Position } from "./PeopleDirectory";

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

// How the agency is laid out: its departments, and the positions in each.
// Leadership titles (no department) span the whole company. Changes save
// as they're made and are kept here; the page refreshes once, on closing.
export function Organisation({ departments, positions, className, children }: { departments: Department[]; positions: Position[]; className: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [teams, setTeams] = useState(departments);
  const [titles, setTitles] = useState(positions);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTeams(departments);
    setTitles(positions);
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
  }

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
            <h2 className="text-base font-semibold">Departments and positions</h2>
            <p className="mt-0.5 text-xs text-muted">Each position belongs to a department, and whoever holds it sits there. Leadership positions span the whole company.</p>
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
                    message={`Remove the ${s.name} department and its positions? Its task tags stay, shared by everyone.`}
                    className="rounded-md p-1 text-muted transition-colors hover:text-red-400"
                    onConfirm={() => removeDepartment(s.id!)}
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {titles
                  .filter((t) => t.teamId === s.id)
                  .map((t) => (
                    <span key={t.id} className="group flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs">
                      {t.name}
                      {t.people > 0 && <span className="text-muted">{t.people}</span>}
                      <ConfirmButton
                        confirm="Remove"
                        message={`Remove the position "${t.name}"?${t.people ? ` ${people(t.people)} will have no position; their access and department stay as they are.` : ""}`}
                        className="text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 focus-visible:opacity-100"
                        onConfirm={() => removePosition(t.id)}
                      >
                        <X size={11} />
                      </ConfirmButton>
                    </span>
                  ))}
                <AddInline label="Add position" onAdd={(name) => addPosition(name, s.id)} />
              </div>
            </section>
          ))}
          <div className="px-5 py-4">
            <AddInline label="Add department" onAdd={addDepartment} />
          </div>
        </div>
        {error && <p className="fade-in px-5 pb-4 text-xs text-red-300">{error}</p>}
      </dialog>
    </>
  );
}
