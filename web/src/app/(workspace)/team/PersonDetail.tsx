"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, History, Mail, PenLine, Phone, Trash2 } from "lucide-react";
import type { EmploymentStatus, Role } from "@prisma/client";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { Reveal } from "../Reveal";
import { createJobTitle, deleteJobTitle, updatePerson, updatePersonPhoto } from "./actions";
import { PhotoEdit } from "../PhotoEdit";
import { ProfileHead } from "../ProfileHead";
import { EMPLOYMENT_LABEL, Face, ROLE_LABEL, type Option, type PersonRecord } from "./PeopleDirectory";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { TaskTagChip } from "../TaskTagPicker";
import { seesEveryTeam } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { GradeBadge, TargetDot } from "../performance/ui";

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

// The same rule the Board applies (see tasks/page.tsx and lib/scope.ts),
// spelled out, so whoever sets Department and Access sees what it grants
// before saving rather than finding out from the person.
function canSeeSummary(role: Role, email: string, team: Option | undefined): string {
  if (seesEveryTeam({ role, email: email.trim().toLowerCase() })) {
    return "Everything: every team's work and the editing queue.";
  }
  const ops = team?.slug === "operations";
  if (role === "core") {
    if (!team) return "Only their own work. Pick a department to give them its view.";
    return ops
      ? `The whole ${team.name} team's work, and every editor's tasks on the editing queue.`
      : `The whole ${team.name} team's work.`;
  }
  return ops ? "Only their own work, including their own editing tasks." : "Only their own work.";
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
// Read first; the admin switches it to a form with Edit. Salary only ever
// arrives from the server when the viewer may edit people.
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
  const today = indiaDay(new Date());
  const blank = {
    name: person.name,
    email: person.email,
    phone: person.phone ?? "",
    role: person.role as string,
    teamId: person.teamId ?? "",
    jobTitleId: person.jobTitleId ?? "",
    joinedAt: person.joinedAt ?? "",
    salary: person.salary ?? "",
    employment: person.employment as string,
    employmentType: person.employmentType ?? "",
    birthday: person.birthday ?? "",
    emergencyContact: person.emergencyContact ?? "",
    notes: person.notes ?? "",
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
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
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setForm(blank);
    setError(null);
    setEditing(false);
  }

  // a position typed into the list that isn't one yet arrives as its name
  async function pickPosition(v: string) {
    if (!v || jobTitles.some((j) => j.id === v)) return set("jobTitleId", v);
    const res = await createJobTitle(v);
    if (res.error || !res.id) return setError(res.error ?? "That position couldn't be added.");
    set("jobTitleId", res.id);
    router.refresh();
  }

  async function removeTitle(id: string) {
    const res = await deleteJobTitle(id);
    if (res.error) setError(res.error);
    else {
      if (form.jobTitleId === id) set("jobTitleId", "");
      router.refresh();
    }
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
            {person.jobTitleName ?? "No position set"}
            {person.teamName && <> · {person.teamName}</>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs ${
                person.employment === "active" ? "text-muted" : "text-amber-300"
              }`}
            >
              <span className={`size-1.5 rounded-full ${person.employment === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
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
                <div className={labelCls}>
                  <span className="flex items-center justify-between gap-2">
                    Position
                    <button type="button" onClick={() => setManaging((m) => !m)} className="text-xs text-muted hover:text-foreground">
                      {managing ? "Done" : "Manage"}
                    </button>
                  </span>
                  <Dropdown
                    value={form.jobTitleId}
                    placeholder="No position"
                    create
                    onChange={pickPosition}
                    options={[{ value: "", label: "No position" }, ...jobTitles.map((j) => ({ value: j.id, label: j.name }))]}
                  />
                </div>
                <div className={labelCls}>
                  Department
                  <Dropdown
                    defaultValue={form.teamId}
                    placeholder="No department"
                    onChange={(v) => set("teamId", v)}
                    options={[{ value: "", label: "No department" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                  />
                </div>

                {/* pulled up by one row gap, so it takes no room while closed */}
                <div className="col-span-full -mt-3 text-xs text-muted">
                  <Reveal open={managing}>
                    {/* shared by everyone: removing one only clears the label */}
                    <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface-2/50 p-2.5">
                      {jobTitles.map((j) => (
                        <span key={j.id} className="group flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted">
                          {j.name}
                          <ConfirmButton
                            confirm="Remove"
                            message={`Remove the position "${j.name}"? Anyone who holds it keeps their access; only the label is cleared.`}
                            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                            onConfirm={() => removeTitle(j.id)}
                          >
                            <Trash2 size={11} />
                          </ConfirmButton>
                        </span>
                      ))}
                      {jobTitles.length === 0 && <span className="px-1 text-xs">Type a new one into Position to add it.</span>}
                    </div>
                  </Reveal>
                </div>

                <div className={labelCls}>
                  Access
                  <Dropdown
                    defaultValue={form.role}
                    onChange={(v) => set("role", v)}
                    options={[
                      { value: "admin", label: "Admin: Every team" },
                      { value: "core", label: "Core: Their whole team" },
                      { value: "employee", label: "Member: Their own work" },
                    ]}
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
                  Can see: {canSeeSummary(form.role as Role, form.email, teams.find((t) => t.id === form.teamId))}
                  {isSelf && form.role !== "admin" && person.role === "admin" && " You can't remove your own admin access."}
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
              <Fact label="Position">{person.jobTitleName}</Fact>
              <Fact label="Department">{person.teamName}</Fact>
              <Fact label="Access">{ROLE_LABEL[person.role]}</Fact>
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

        <Section
          title="Current work"
          aside={
            person.current.length > 0 && (
              <>
                {person.current.length} open
                {person.overdue > 0 && <span className="text-red-300"> · {person.overdue} overdue</span>}
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
                    <span key={name} className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
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
                        <span className={`hidden shrink-0 whitespace-nowrap text-xs sm:block ${late ? "text-red-300" : "text-muted"}`}>
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
                This month · Full details <ArrowUpRight size={12} />
              </Link>
            }
          >
            <div className="flex items-center gap-3">
              <GradeBadge grade={person.editorKpi.grade} />
              <div className="grid flex-1 grid-cols-5 gap-2">
                {person.editorKpi.rows.map((r) => (
                  <div key={r.label} className="min-w-0 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-base font-semibold tabular-nums">
                      {r.text}
                      <TargetDot ok={r.ok} />
                    </span>
                    <span className="block truncate text-xs text-muted">{r.label}</span>
                  </div>
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
