"use client";

import { useRef, useState } from "react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { ArrowUpRight, Eye, EyeOff, History, KeyRound, Mail, PenLine, Phone } from "lucide-react";
import type { EmploymentStatus, Role } from "@prisma/client";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { resetPassword, setAccess, updatePerson, updatePersonPhoto } from "./actions";
import { closeOnBackdrop } from "../dialog";
import { MIN_PASSWORD } from "@/lib/account";
import { Organisation } from "./Organisation";
import { PhotoEdit } from "../PhotoEdit";
import { ProfileHead } from "../ProfileHead";
import { DUE_TONE } from "../TaskCard";
import { EMPLOYMENT_LABEL, Face, ROLE_LABEL, ROLE_REACH, type Department, type PersonRecord, type Position, type WorkTag } from "./PeopleDirectory";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { TaskTagChip } from "../TaskTagPicker";
import { LEVEL_NOTE } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { GradeBadge, ScoreTile } from "../performance/ui";
import { LETTER_LABEL } from "@/lib/videoScore";

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";
const labelCls = "flex min-w-0 flex-col gap-1 text-xs text-muted";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// the open work shown before "Show all"
const FIRST = 5;

// "12 Mar 2025"; "12 Mar" without the year
function date(iso: string, year = true) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${year ? ` ${y}` : ""}`;
}

// "1 yr 4 mo", "7 mo", "New"
function tenure(joined: string, today: string) {
  const [y1, m1, d1] = joined.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 1) return "New";
  const yrs = Math.floor(months / 12);
  return [yrs && `${yrs} yr`, months % 12 && `${months % 12} mo`].filter(Boolean).join(" ");
}

const hours = (h: number) => (h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`);
const inr = (v: string) => `₹${Number(v).toLocaleString("en-IN")}`;

// What a level reaches (lib/scope), spelled out, so whoever sets it sees
// what it grants before saving rather than finding out from the person.
function canSeeSummary(role: Role): string {
  return `${LEVEL_NOTE[role]}.`;
}

// a department or role, on or off: the app's choice chip (.chip), lit when on
const chip = (_on: boolean, editable: boolean) => `chip rounded-full px-3 py-1 text-xs ${editable ? "" : "pointer-events-none"}`;

// Level, then departments, then the roles inside those departments: each a
// chip, saved the moment it's switched. Taking a department away takes its
// roles with it. Those the viewer may not change are shown only if on.
function DepartmentsAndRoles({
  person,
  teams,
  roles,
  workTags,
  editableTeamIds,
  canManage,
}: {
  person: PersonRecord;
  teams: Department[];
  roles: Position[];
  workTags: WorkTag[];
  editableTeamIds: string[];
  canManage: boolean;
}) {
  const [departmentIds, setDepartmentIds] = useState(person.departmentIds);
  const [roleIds, setRoleIds] = useState(person.roleIds);
  const [error, setError] = useState<string | null>(null);
  const editable = (teamId: string | null) => person.canSetAccess && !!teamId && editableTeamIds.includes(teamId);
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function save(next: { departmentIds: string[]; roleIds: string[] }) {
    // a role only ever sits inside one of their departments
    const kept = { departmentIds: next.departmentIds, roleIds: next.roleIds.filter((r) => next.departmentIds.includes(roles.find((x) => x.id === r)?.teamId ?? "")) };
    const before = { departmentIds, roleIds };
    setDepartmentIds(kept.departmentIds);
    setRoleIds(kept.roleIds);
    setError(null);
    const res = await setAccess(person.id, kept);
    if (res.error) {
      setDepartmentIds(before.departmentIds);
      setRoleIds(before.roleIds);
      setError(res.error);
    }
  }

  const levelOne = person.role === "admin";
  const shownTeams = teams.filter((t) => editable(t.id) || departmentIds.includes(t.id));
  const groups = teams
    .filter((t) => departmentIds.includes(t.id))
    .map((t) => ({ team: t, roles: roles.filter((r) => r.teamId === t.id && (editable(t.id) || roleIds.includes(r.id))) }))
    .filter((g) => g.roles.length);

  return (
    <Section
      title="Departments and roles"
      aside={
        canManage && (
          <Organisation departments={teams} positions={roles} workTags={workTags} className="text-xs text-muted transition-colors hover:text-foreground">
            Manage departments
          </Organisation>
        )
      }
    >
      {levelOne ? (
        <p className="text-sm text-muted">Leadership sees every department and oversees the work, so it has no departments or roles of its own.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Departments</p>
            {shownTeams.length ? (
              <div className="flex flex-wrap gap-1.5">
                {shownTeams.map((t) => (
                  <button key={t.id} type="button" disabled={!editable(t.id)} onClick={() => save({ departmentIds: flip(departmentIds, t.id), roleIds })} aria-pressed={departmentIds.includes(t.id)} className={chip(departmentIds.includes(t.id), editable(t.id))}>
                    {t.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted/60">None yet</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Roles</p>
            {groups.length ? (
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <div key={g.team.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="w-32 shrink-0 text-xs font-medium text-foreground/80">{g.team.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {g.roles.map((r) => (
                        <button key={r.id} type="button" disabled={!editable(g.team.id)} onClick={() => save({ departmentIds, roleIds: flip(roleIds, r.id) })} aria-pressed={roleIds.includes(r.id)} className={chip(roleIds.includes(r.id), editable(g.team.id))}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted/60">{departmentIds.length ? "None yet" : "Pick a department first"}</p>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </Section>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <div className="shrink-0 text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-full" : ""}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children ?? <span className="text-muted/60">Not set</span>}</dd>
    </div>
  );
}

function Stat({ value, label, lit = true }: { value: React.ReactNode; label: string; lit?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
      <span className={`text-xl font-semibold tabular-nums ${lit ? "" : "text-muted"}`}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

// One person's record, top to bottom: who they are, what they're on now,
// how the last month went, and a way into everything they've ever finished.
// Level 1 gives someone a new password when they've lost theirs: a key
// button by their name, a small window, one field. They're told it, and can
// change it themselves under Account.
function ResetPassword({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const first = name.split(" ")[0];

  function open() {
    setPassword("");
    setError(null);
    setDone(false);
    ref.current?.showModal();
  }
  async function save() {
    if (busy) return;
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setError(null);
    const res = await resetPassword(id, password).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(true);
  }

  return (
    <>
      <button type="button" onClick={open} aria-label="Reset password" title="Reset password" className="btn-glow flex h-9 w-9 items-center justify-center rounded-full">
        <KeyRound size={15} />
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 className="text-base font-semibold">Reset {first}&apos;s password</h2>
          {done ? (
            <p className="fade-in text-sm text-muted">
              Done. Tell {first} the new password; they can change it under Account.
            </p>
          ) : (
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              New password
              <span className="relative">
                <input
                  autoFocus
                  type={show ? "text" : "password"}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pr-9 text-sm text-foreground outline-none focus:border-hover disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  title={show ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="fade-in text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
              {done ? "Close" : "Cancel"}
            </button>
            {!done && (
              <button type="submit" disabled={busy || !password} className="btn btn-glow disabled:opacity-50">
                {busy ? "Saving…" : "Reset password"}
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}

// Read first; the admin switches it to a form with Edit. Salary only ever
// arrives from the server when the viewer may edit people.
export function PersonDetail({
  person,
  teams,
  jobTitles,
  workTags,
  canEdit,
  editableTeamIds,
  isSelf,
  seesLevels,
}: {
  person: PersonRecord;
  teams: Department[];
  jobTitles: Position[];
  workTags: WorkTag[];
  canEdit: boolean;
  editableTeamIds: string[];
  isSelf: boolean;
  // levels are internal: only Level 1 sees them
  seesLevels: boolean;
}) {
  const today = indiaDay(new Date());
  const blank = {
    name: person.name,
    email: person.email,
    phone: person.phone ?? "",
    role: person.role as string,
    joinedAt: person.joinedAt ?? "",
    salary: person.salary ?? "",
    employment: person.employment as string,
    employmentType: person.employmentType ?? "",
    position: person.position ?? "",
    birthday: person.birthday ?? "",
    emergencyContact: person.emergencyContact ?? "",
    notes: person.notes ?? "",
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allWork, setAllWork] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
    // the save revalidates the page, which brings the new record in
    setEditing(false);
  }

  function cancel() {
    setForm(blank);
    setError(null);
    setEditing(false);
  }


  const p = person.performance;
  const shown = allWork ? person.current : person.current.slice(0, FIRST);
  const projects = [...new Set(person.current.filter((t) => t.project).map((t) => `${t.client} · ${t.project}`))];

  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <ProfileHead
          photo={
            // the admin can change anyone's photo here, and you can change your own
            canEdit || isSelf ? (
              <PhotoEdit person name={person.name} src={person.avatarUrl} size="fill" save={(d) => updatePersonPhoto(person.id, d)} />
            ) : (
              <Face person={person} size="fill" />
            )
          }
        >
          <h1 className="truncate text-lg font-semibold">{person.name}</h1>
          <p className="truncate text-sm text-muted">
            {[person.position ?? person.jobTitleName, seesLevels && ROLE_LABEL[person.role]].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs ${person.employment === "active" ? "text-muted" : "text-foreground"}`}
            >
              {EMPLOYMENT_LABEL[person.employment as EmploymentStatus]}
            </span>
            {person.employmentType && (
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                {EMPLOYMENT_TYPE_LABEL[person.employmentType]}
              </span>
            )}
          </div>
        </ProfileHead>
        <div className="flex shrink-0 gap-2">
          {canEdit && <ResetPassword id={person.id} name={person.name} />}
          <a href={`mailto:${person.email}`} aria-label="Email" className="btn-glow flex h-9 w-9 items-center justify-center rounded-full">
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
          title="Employee information"
          aside={
            canEdit &&
            !editing && (
              <button onClick={() => setEditing(true)} className="btn btn-xs btn-ghost flex items-center gap-1">
                <PenLine size={12} /> Edit
              </button>
            )
          }
        >
          {editing ? (
            <div className="fade-in flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-3">
                <label className={labelCls}>
                  Name
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} />
                </label>
                <label className={labelCls}>
                  Position
                  <input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="Senior Video Editor" className={field} />
                </label>
                <div className={labelCls}>
                  Level
                  <Dropdown
                    defaultValue={form.role}
                    onChange={(v) => set("role", v)}
                    options={(["admin", "core", "employee"] as Role[]).map((r) => ({ value: r, label: ROLE_REACH[r] }))}
                  />
                </div>
                <div className={labelCls}>
                  Employment type
                  <Dropdown
                    defaultValue={form.employmentType}
                    placeholder="Not set"
                    onChange={(v) => set("employmentType", v)}
                    options={Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <div className={labelCls}>
                  Status
                  <Dropdown
                    defaultValue={form.employment}
                    onChange={(v) => set("employment", v)}
                    options={Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <p className="col-span-full -mt-1 text-xs text-muted">
                  {canSeeSummary(form.role as Role)}
                  {isSelf && form.role !== "admin" && person.role === "admin" && " You can't remove your own Founder level."}
                </p>

                <div className={labelCls}>
                  Joined
                  <DatePicker value={form.joinedAt} onChange={(v) => set("joinedAt", v)} placeholder="Not set" />
                </div>
                <label className={labelCls}>
                  <span>
                    Salary <span className="text-muted/70">· Monthly, INR</span>
                  </span>
                  <input value={form.salary} onChange={(e) => set("salary", e.target.value)} placeholder="Not set" inputMode="numeric" className={field} />
                </label>
                <div className={labelCls}>
                  Birthday
                  <DatePicker value={form.birthday} onChange={(v) => set("birthday", v)} placeholder="Not set" />
                </div>

                <label className={labelCls}>
                  Email
                  <input value={form.email} onChange={(e) => set("email", e.target.value)} className={field} />
                </label>
                <label className={labelCls}>
                  Phone
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" className={field} />
                </label>
                <label className={labelCls}>
                  Emergency contact
                  <input
                    value={form.emergencyContact}
                    onChange={(e) => set("emergencyContact", e.target.value)}
                    placeholder="Name and number"
                    className={field}
                  />
                </label>
                <label className={`${labelCls} col-span-full`}>
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={2}
                    placeholder="Working hours, strengths, what they're learning…"
                    className={field}
                  />
                </label>
              </div>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={cancel} className="btn btn-sm btn-ghost">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="btn btn-sm btn-glow disabled:opacity-60">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <dl className="fade-in grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
              <Fact label="Position">{person.position}</Fact>
              {seesLevels && <Fact label="Level">{ROLE_LABEL[person.role]}</Fact>}
              <Fact label="Joined">
                {person.joinedAt && (
                  <>
                    {date(person.joinedAt)} <span className="text-muted">· {tenure(person.joinedAt, today)}</span>
                  </>
                )}
              </Fact>
              <Fact label="Employment type">{person.employmentType && EMPLOYMENT_TYPE_LABEL[person.employmentType]}</Fact>
              {canEdit && <Fact label="Salary">{person.salary && `${inr(person.salary)} / month`}</Fact>}
              <Fact label="Email">{person.email}</Fact>
              <Fact label="Phone">{person.phone}</Fact>
              <Fact label="Birthday">{person.birthday && date(person.birthday, false)}</Fact>
              <Fact label="Emergency contact">{person.emergencyContact}</Fact>
              {person.notes && (
                <Fact label="Notes" wide>
                  <span className="whitespace-pre-line">{person.notes}</span>
                </Fact>
              )}
            </dl>
          )}
        </Section>

        <DepartmentsAndRoles person={person} teams={teams} roles={jobTitles} workTags={workTags} editableTeamIds={editableTeamIds} canManage={canEdit} />

        <Section
          title="Current work"
          aside={
            person.current.length > 0 && (
              <>
                {person.current.length} open
                {person.overdue > 0 && <span className="text-rose-400"> · {person.overdue} overdue</span>}
              </>
            )
          }
        >
          {person.current.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Nothing in progress.</p>
          ) : (
            <>
              {projects.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {projects.map((name) => (
                    <span key={name} className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-0.5 text-xs text-foreground/75">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                {shown.map((t) => {
                  const late = !!t.due && t.due < today;
                  return (
                    <li key={`${t.kind}-${t.id}`} className="flex items-center gap-3 bg-surface/40 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.title}</span>
                        <span className="block truncate text-xs text-muted">{t.client ? [t.client, t.project].filter(Boolean).join(" · ") : "Own work"}</span>
                      </span>
                      {t.tags.length > 0 && (
                        <span className="hidden shrink-0 items-center gap-1 lg:flex">
                          {t.tags.map((x) => (
                            <TaskTagChip key={x} name={x} />
                          ))}
                        </span>
                      )}
                      {t.due && (
                        <span className={`hidden shrink-0 whitespace-nowrap text-xs sm:block ${late ? DUE_TONE.overdue : DUE_TONE.upcoming}`}>
                          {late ? "Was due" : "Due"} {date(t.due, false)}
                        </span>
                      )}
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${t.pill}`}>{t.status}</span>
                    </li>
                  );
                })}
              </ul>
              {person.current.length > FIRST && (
                <button onClick={() => setAllWork((v) => !v)} className="mt-2 text-xs text-muted hover:text-foreground">
                  {allWork ? "Show less" : `Show all ${person.current.length}`}
                </button>
              )}
            </>
          )}
        </Section>

        {person.editorKpi ? (
          <Section
            title="Performance"
            aside={
              <Link href={`/performance/${person.id}`} className="flex items-center gap-1 hover:text-foreground">
                This week · Full details <ArrowUpRight size={12} />
              </Link>
            }
          >
            <div className="flex flex-col gap-5">
              <span className="flex items-center gap-3">
                <GradeBadge grade={person.editorKpi.letter} />
                <span className="flex flex-col">
                  <span className="text-base font-medium">
                    {person.editorKpi.letter ? LETTER_LABEL[person.editorKpi.letter] : "No grade yet"}
                    {person.editorKpi.score !== null && <span className="ml-2 text-sm font-normal tabular-nums text-muted">{person.editorKpi.score}</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {person.editorKpi.videos} video{person.editorKpi.videos === 1 ? "" : "s"}
                  </span>
                </span>
              </span>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                {person.editorKpi.parts.map((r) => (
                  <ScoreTile key={r.part} part={r.part} letter={r.letter} score={r.score} fact={r.fact} />
                ))}
              </div>
            </div>
          </Section>
        ) : (
        <Section title="Performance" aside="Last 30 days">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat value={p.completed} label="Finished" lit={p.completed > 0} />
            <Stat value={p.onTimePct === null ? "–" : `${p.onTimePct}%`} label="On time" lit={p.onTimePct !== null} />
            <Stat value={p.completed ? hours(p.medianTurnaround) : "–"} label="Median turnaround" lit={p.completed > 0} />
            <Stat value={p.completed ? p.revisionsPerTask : "–"} label="Revisions per task" lit={p.completed > 0} />
          </div>
        </Section>
        )}

        {/* everything they've ever finished lives on History, filtered to them */}
        <Link
          href={`/history?person=${person.id}`}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-surface-2/30 px-5 py-4 transition-colors hover:bg-surface-2/60"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <History size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">View work history</span>
            <span className="block text-xs text-muted">Everything they&apos;ve finished, with timings and revisions.</span>
          </span>
          <ArrowUpRight size={15} className="shrink-0 text-muted transition-colors group-hover:text-foreground" />
        </Link>
      </div>
    </div>
  );
}
