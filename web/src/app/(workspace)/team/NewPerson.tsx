"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, UserPlus, X } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { closeOnBackdrop } from "../dialog";
import { createPerson } from "./actions";
import { LEVEL_LABEL } from "@/lib/scope";
import type { Department } from "./PeopleDirectory";

const EMPTY = { name: "", email: "", role: "employee", teamId: "", password: "" };
const LABEL = "flex flex-col gap-1 text-xs text-muted";
const FIELD = "field rounded-lg px-3 py-2 text-sm text-foreground";

// Adding someone (Level 1): who they are, the email and first password they
// sign in with (they change it under Account), their level and main
// department. Their page opens straight after, for the rest.
export function NewPerson({ departments, className, onAdded }: { departments: Department[]; className: string; onAdded: (id: string) => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(EMPTY);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function open() {
    setForm(EMPTY);
    setShown(false);
    setError(null);
    ref.current?.showModal();
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createPerson(form).catch(() => ({ error: "That didn't go through. Check your connection and try again.", id: undefined }));
    setBusy(false);
    if (res.error || !res.id) return setError(res.error ?? "They couldn't be added.");
    ref.current?.close();
    onAdded(res.id);
    router.refresh();
  }

  const ready = form.name.trim() && form.email.trim() && form.password && !busy;

  return (
    <>
      <button type="button" onClick={open} aria-label="New person" className={`group/tip ${className}`}>
        <UserPlus size={15} />
        <span className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 whitespace-nowrap panel rounded-lg px-2.5 py-1.5 text-xs text-foreground opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100">
          New person
        </span>
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save();
          }}
          className="flex flex-col gap-3 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">New person</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="btn-ghost flex size-7 items-center justify-center rounded-md">
              <X size={15} />
            </button>
          </div>
          <label className={LABEL}>
            Name
            <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className={FIELD} />
          </label>
          <label className={LABEL}>
            Email they sign in with
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" className={FIELD} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className={LABEL}>
              Level
              <Dropdown value={form.role} onChange={(v) => set("role", v)} options={(["admin", "core", "employee"] as const).map((r) => ({ value: r, label: LEVEL_LABEL[r] }))} />
            </div>
            <div className={LABEL}>
              Department
              <Dropdown value={form.teamId} placeholder="None yet" onChange={(v) => set("teamId", v)} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
            </div>
          </div>
          <label className={LABEL}>
            First password (they change it under Account)
            <span className="relative">
              <input
                type={shown ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
                className={`${FIELD} w-full pr-9`}
              />
              <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-foreground">
                {shown ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={!ready} className="btn btn-sm btn-glow disabled:opacity-50">
              {busy ? "Adding…" : "Add person"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
