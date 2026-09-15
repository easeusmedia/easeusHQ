"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, Phone, Plus, Trash2, X } from "lucide-react";
import type { EmploymentStatus, Role } from "@prisma/client";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { createJobTitle, deleteJobTitle, updatePerson } from "./actions";
import { EMPLOYMENT_LABEL, Face, ROLE_LABEL, type Option, type PersonRecord } from "./PeopleDirectory";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";
const labelCls = "flex min-w-0 flex-col gap-1 text-xs text-muted";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

// One person's whole record. Read-only for a core member looking at their
// own team; a real form for admin. Salary only ever arrives from the server
// when the viewer may edit people, so there's nothing to leak here.
export function PersonDetail({
  person,
  teams,
  jobTitles,
  canEdit,
  isSelf,
}: {
  person: PersonRecord;
  teams: Option[];
  jobTitles: Option[];
  canEdit: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: person.name,
    email: person.email,
    phone: person.phone ?? "",
    role: person.role as string,
    teamId: person.teamId ?? "",
    jobTitleId: person.jobTitleId ?? "",
    joinedAt: person.joinedAt ?? "",
    salary: person.salary ?? "",
    employment: person.employment as string,
    notes: person.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [addingTitle, setAddingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updatePerson({ id: person.id, ...form });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function addTitle() {
    const name = newTitle.trim();
    if (!name) return;
    const res = await createJobTitle(name);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewTitle("");
    setAddingTitle(false);
    router.refresh();
  }

  async function removeTitle(id: string) {
    const res = await deleteJobTitle(id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <Face person={person} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{person.name}</h1>
          <p className="truncate text-sm text-muted">
            {person.jobTitleName ?? "No role set"}
            {person.teamName && <> · {person.teamName}</>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
              {ROLE_LABEL[person.role as Role]} access
            </span>
            <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
              {EMPLOYMENT_LABEL[person.employment as EmploymentStatus]}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`mailto:${person.email}`}
            aria-label="Email"
            className="btn-glow flex h-9 w-9 items-center justify-center rounded-full"
          >
            <Mail size={15} />
          </a>
          {person.phone && (
            <a
              href={`tel:${person.phone.replace(/\s/g, "")}`}
              aria-label="Call"
              className="btn-glow flex h-9 w-9 items-center justify-center rounded-full"
            >
              <Phone size={15} />
            </a>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-6 p-6">
        {/* what they're actually carrying — the reason to open this page at
            all is usually "how loaded is this person" */}
        <div className="grid grid-cols-3 gap-3">
          <Stat value={person.clientLoad} label="Client tasks open" />
          <Stat value={person.openWork} label="Work tasks open" />
          <Stat value={person.doneWork} label="Work tasks finished" />
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <label className={labelCls}>
                Name
                <input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} />
              </label>
              <label className={labelCls}>
                Email
                <input value={form.email} onChange={(e) => set("email", e.target.value)} className={field} />
              </label>
              <label className={labelCls}>
                Phone
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" className={field} />
              </label>
              <div className={labelCls}>
                Joined
                <DatePicker value={form.joinedAt} onChange={(v) => set("joinedAt", v)} placeholder="Not set" />
              </div>

              <div className={labelCls}>
                Team
                <Dropdown
                  defaultValue={form.teamId}
                  placeholder="No team"
                  onChange={(v) => set("teamId", v)}
                  options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                />
              </div>
              <div className={labelCls}>
                <span className="flex items-center justify-between gap-2">
                  Role
                  {!addingTitle && (
                    <button
                      type="button"
                      onClick={() => setAddingTitle(true)}
                      className="flex items-center gap-0.5 text-xs text-muted hover:text-foreground"
                    >
                      <Plus size={11} /> New
                    </button>
                  )}
                </span>
                {addingTitle ? (
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTitle();
                        }
                        if (e.key === "Escape") setAddingTitle(false);
                      }}
                      placeholder="e.g. Motion designer"
                      className={`${field} min-w-0 flex-1`}
                    />
                    <button type="button" onClick={addTitle} aria-label="Add role" className="btn-glow shrink-0 rounded-lg p-2">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => setAddingTitle(false)} aria-label="Cancel" className="btn-ghost shrink-0 rounded-lg p-2">
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <Dropdown
                    key={jobTitles.length}
                    defaultValue={form.jobTitleId}
                    placeholder="No role"
                    onChange={(v) => set("jobTitleId", v)}
                    options={[{ value: "", label: "No role" }, ...jobTitles.map((j) => ({ value: j.id, label: j.name }))]}
                  />
                )}
              </div>

              <div className={labelCls}>
                Access level
                <Dropdown
                  defaultValue={form.role}
                  onChange={(v) => set("role", v)}
                  options={[
                    { value: "admin", label: "Admin — every team" },
                    { value: "core", label: "Core — runs their team" },
                    { value: "employee", label: "Member — their own work" },
                  ]}
                />
              </div>
              <div className={labelCls}>
                Status
                <Dropdown
                  defaultValue={form.employment}
                  onChange={(v) => set("employment", v)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "on_leave", label: "On leave" },
                    { value: "former", label: "Former" },
                  ]}
                />
              </div>

              <label className={labelCls}>
                Salary <span className="font-normal normal-case text-muted/70">(monthly, INR)</span>
                <input
                  value={form.salary}
                  onChange={(e) => set("salary", e.target.value)}
                  placeholder="Not set"
                  inputMode="numeric"
                  className={field}
                />
              </label>
              <span />

              <label className={`${labelCls} col-span-2`}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Anything worth knowing — working hours, strengths, what they're being trained on…"
                  className={field}
                />
              </label>
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}
            {isSelf && form.role !== "admin" && person.role === "admin" && (
              <p className="text-xs text-muted">You can&apos;t remove your own admin access.</p>
            )}

            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="text-xs text-muted">Saved.</span>}
            </div>

            {/* the list of roles itself, managed here rather than on a page
                of its own — it's two fields and one delete */}
            {jobTitles.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted">Roles in use</p>
                <div className="flex flex-wrap gap-1.5">
                  {jobTitles.map((j) => (
                    <span
                      key={j.id}
                      className="group flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted"
                    >
                      {j.name}
                      <ConfirmButton
                        message={`Remove the role "${j.name}"? Anyone holding it keeps their access — they just lose the label.`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                        onConfirm={() => removeTitle(j.id)}
                      >
                        <Trash2 size={11} />
                      </ConfirmButton>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // core members see the roster, not the employment terms
          <dl className="grid grid-cols-2 gap-3">
            {[
              ["Email", person.email],
              ["Phone", person.phone ?? "—"],
              ["Team", person.teamName ?? "—"],
              ["Role", person.jobTitleName ?? "—"],
              ["Joined", person.joinedAt ?? "—"],
              ["Status", EMPLOYMENT_LABEL[person.employment as EmploymentStatus]],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border bg-surface-2/50 px-4 py-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 truncate text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
