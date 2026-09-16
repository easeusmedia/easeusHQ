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
import { TaskTagChip } from "../TaskTagPicker";
import { seesEveryTeam } from "@/lib/scope";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";
const labelCls = "flex min-w-0 flex-col gap-1 text-xs text-muted";

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Each block on this page is its own card with its own heading. It used to
// be one continuous column — load, then employment form, then roles, then
// history — which made it impossible to answer "what is this person on right
// now" without reading past their salary to get there.
function Section({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0 text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// The same rule the Board applies (see tasks/page.tsx and lib/scope.ts),
// spelled out, so whoever sets Team and Access level sees what it grants
// before saving rather than finding out from the person.
function canSeeSummary(role: Role, email: string, team: Option | undefined): string {
  if (seesEveryTeam({ role, email: email.trim().toLowerCase() })) {
    return role === "admin"
      ? "Everything: every team's work and the editing queue."
      : "Everything: every team's work and the editing queue (developer access).";
  }
  const ops = team?.slug === "operations";
  if (role === "core") {
    if (!team) return "Only their own work. Pick a team to give them that team's view.";
    return ops
      ? `The whole ${team.name} team's work, and every editor's tasks on the editing queue.`
      : `The whole ${team.name} team's work.`;
  }
  return ops ? "Only their own work, including their own editing tasks." : "Only their own work.";
}

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

  // both editable cards save the whole record — one form, two places to
  // commit it from, so neither card needs scrolling past the other
  const saveRow = (
    <>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-xs text-muted">Saved.</span>}
      </div>
    </>
  );

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

      <div className="flex flex-col gap-4 p-6">
        <Section
          title="Currently working on"
          subtitle="Everything open right now, across the client queue and their own task list."
          aside={`${person.current.length} open`}
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat value={person.clientLoad} label="Client tasks open" />
            <Stat value={person.openWork} label="Work tasks open" />
            <Stat value={person.doneWork} label="Work tasks finished" />
          </div>

          {person.current.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              Nothing in flight.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              {person.current.map((t) => (
                <li key={`${t.kind}-${t.id}`} className="flex items-center gap-3 bg-surface/40 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.title}</span>
                    {t.context && <span className="block truncate text-xs text-muted">{t.context}</span>}
                  </span>
                  {t.tags.length > 0 && (
                    <span className="hidden shrink-0 items-center gap-1 lg:flex">
                      {t.tags.map((x) => (
                        <TaskTagChip key={x} name={x} />
                      ))}
                    </span>
                  )}
                  {t.due && <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted sm:block">Due {when(t.due)}</span>}
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${t.pill}`}>{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {canEdit ? (
          <>
          {/* first, because it's what decides everything else about how
              this person uses the app — and it's the thing admin comes
              here to change most */}
          <Section title="Team & access" subtitle="Decides whose work they see on the Board.">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
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
                Access level
                <Dropdown
                  defaultValue={form.role}
                  onChange={(v) => set("role", v)}
                  options={[
                    { value: "admin", label: "Admin — every team" },
                    { value: "core", label: "Core — their whole team" },
                    { value: "employee", label: "Member — their own work" },
                  ]}
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

            </div>
            <p className="rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-sm">
              <span className="text-muted">Can see: </span>
              {canSeeSummary(form.role as Role, form.email, teams.find((t) => t.id === form.teamId))}
            </p>
            {isSelf && form.role !== "admin" && person.role === "admin" && (
              <p className="text-xs text-muted">You can&apos;t remove your own admin access.</p>
            )}
            {saveRow}
          </div>
          </Section>

          <Section title="Employment details" subtitle="Only the admin can change any of this.">
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
                <span>
                  Salary <span className="text-muted/70">· monthly, INR</span>
                </span>
                <input
                  value={form.salary}
                  onChange={(e) => set("salary", e.target.value)}
                  placeholder="Not set"
                  inputMode="numeric"
                  className={field}
                />
              </label>
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

            {saveRow}
          </div>
          </Section>
          </>
        ) : (
          // core members see the roster, not the employment terms
          <Section title="Details">
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
          </Section>
        )}

        {/* What they've actually finished, from both task systems at once —
            an employee's record of work shouldn't depend on which board a
            given job happened to live on. */}
        <Section
          title="Work history"
          subtitle="Finished work and delivered client work, newest first."
          aside={`${person.history.length} completed`}
        >
          {person.history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              Nothing finished yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              {person.history.slice(0, 40).map((h) => (
                <li key={`${h.kind}-${h.id}`} className="flex items-center gap-3 bg-surface-2/30 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{h.title}</span>
                    {h.context && <span className="block truncate text-xs text-muted">{h.context}</span>}
                  </span>
                  {h.tags.length > 0 && (
                    <span className="hidden shrink-0 items-center gap-1 sm:flex">
                      {h.tags.map((t) => (
                        <TaskTagChip key={t} name={t} />
                      ))}
                    </span>
                  )}
                  <span className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-muted">
                    {h.kind === "client" ? "Delivered" : "Done"}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted">{when(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
          {person.history.length > 40 && (
            <p className="mt-2 text-xs text-muted">Showing the 40 most recent.</p>
          )}
        </Section>

        {/* Agency-wide, not this person's — it lives last and says so. Having
            it sit inside the employment form made one person's record look
            like the place roles are defined, which is exactly backwards. */}
        {canEdit && jobTitles.length > 0 && (
          <Section
            title="Roles"
            subtitle="Shared across everyone. Removing one only takes the label away — nobody's access changes."
            aside={
              <button
                type="button"
                onClick={() => setAddingTitle(true)}
                className="flex items-center gap-0.5 hover:text-foreground"
              >
                <Plus size={11} /> New role
              </button>
            }
          >
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
          </Section>
        )}
      </div>
    </div>
  );
}
