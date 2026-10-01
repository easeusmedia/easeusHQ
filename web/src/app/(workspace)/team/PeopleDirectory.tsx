"use client";

import { useCallback, useMemo, useState } from "react";
import { Network, Search, Users2 } from "lucide-react";
import type { EmploymentStatus, Role } from "@prisma/client";
import type { Letter, Part } from "@/lib/videoScore";
import { Avatar } from "../TaskCard";
import { PersonDetail } from "./PersonDetail";
import { Organisation } from "./Organisation";

// One thing currently on someone's plate, from either task system.
export type TaskEntry = {
  id: string;
  title: string;
  kind: "work" | "client";
  status: string;
  pill: string;
  client: string | null;
  project: string | null;
  tags: string[];
  due: string | null;
};

export type PersonRecord = {
  id: string;
  name: string;
  email: string;
  // the team they're shown under (lib/teams) — an Operations editor under
  // Editors — as opposed to teamId, the team their access comes from
  shownTeam: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  employment: EmploymentStatus;
  employmentType: string | null;
  teamId: string | null;
  teamName: string | null;
  departmentName: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  // the title everyone sees; their level is for Level 1 only
  position: string | null;
  joinedAt: string | null;
  birthday: string | null;
  emergencyContact: string | null;
  salary: string | null;
  notes: string | null;
  current: TaskEntry[];
  overdue: number;
  // the last 30 days, scored as History scores them
  performance: { completed: number; onTimePct: number | null; medianTurnaround: number; revisionsPerTask: number };
  // an editor's month as the Performance page reads it; null for everyone else
  // this week's letter from their videos, the number only for those who may see it
  editorKpi: { letter: Letter | null; score: number | null; videos: number; parts: { part: Part; letter: Letter | null; score: number | null; fact?: string }[] } | null;
  // the departments they work in or run, and the roles they hold
  departmentIds: string[];
  roleIds: string[];
  // whether the viewer may change those (lib/scope canSetAccess)
  canSetAccess: boolean;
};

export type Option = { id: string; name: string; slug?: string };
// a department, and a position filed under one (none: leadership), with how
// many current people each has
export type Department = Option & { people: number; keywords?: string };
// a role, in its department, with how its tasks move
export type Position = { id: string; name: string; teamId: string | null; people: number; workflow?: string };
// a kind of work a department's tasks are labelled with, and how many use it
export type WorkTag = { id: string; name: string; teamId: string | null; uses: number; roleId?: string | null; workflow?: string };

const FORMER = "Former employees";
// Level 1, who has no department
const LEADERSHIP = "Leadership";
const LEVELS: Role[] = ["admin", "core", "employee"];

export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  former: "Former",
};

// a level's name (lib/scope LEVEL_LABEL), and what it reaches
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Level 1",
  core: "Level 2",
  employee: "Level 3",
};
export const ROLE_REACH: Record<Role, string> = {
  admin: "Level 1: Everything",
  core: "Level 2: Their departments",
  employee: "Level 3: Their own work",
};

// a person's photo (or initials) and online dot — the shared avatar
export function Face({ person, size }: { person: { name: string }; size: number | "fill" }) {
  return <Avatar name={person.name} size={size} />;
}

// Roster on the left, the open record on the right — the same two-pane shape
// the chat dashboard uses, so "a list of people and the one you're looking
// at" reads the same way twice rather than twice differently.
export function PeopleDirectory({
  people,
  teams,
  jobTitles,
  workTags,
  canEdit,
  editableTeamIds,
  meId,
  openFirst,
  seesLevels,
}: {
  people: PersonRecord[];
  teams: Department[];
  jobTitles: Position[];
  workTags: WorkTag[];
  canEdit: boolean;
  // the departments whose access the viewer may give (all, for a Founder)
  editableTeamIds: string[];
  meId: string;
  openFirst?: string;
  // Level 1: people grouped by level; everyone else by department
  seesLevels: boolean;
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(people.find((p) => p.id === openFirst)?.id ?? people[0]?.id ?? null);

  // Level 1 sees people by level; everyone else by department, since levels
  // are internal. Former employees go at the bottom either way.
  const groupOf = useCallback((p: PersonRecord) => (p.employment === "former" ? FORMER : seesLevels ? ROLE_LABEL[p.role] : (p.departmentName ?? LEADERSHIP)), [seesLevels]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (team === "all" || (team === "former" ? p.employment === "former" : groupOf(p) === team)) &&
        (!q || [p.name, p.email, p.position ?? "", p.jobTitleName ?? ""].some((v) => v.toLowerCase().includes(q)))
    );
  }, [people, query, team, groupOf]);

  const open = people.find((p) => p.id === openId) ?? null;

  const order = seesLevels ? LEVELS.map((r) => ROLE_LABEL[r]) : [LEADERSHIP, ...teams.map((t) => t.name)];
  const rank = (k: string) => (k === FORMER ? 99 : order.indexOf(k) + 1);

  // the filter chips: each group there's someone in, then Former
  const shownTeams = [...new Set(people.filter((p) => p.employment !== "former").map(groupOf))].sort((a, b) => rank(a) - rank(b)).map((g) => ({ id: g, name: g }));

  const byGroup = new Map<string, PersonRecord[]>();
  for (const p of filtered) byGroup.set(groupOf(p), [...(byGroup.get(groupOf(p)) ?? []), p]);
  const groups = [...byGroup.entries()].sort(([a], [b]) => rank(a) - rank(b));

  return (
    <div className="flex h-full gap-4">
      <aside className="flex w-[min(20rem,40vw)] shrink-0 flex-col overflow-hidden panel rounded-2xl">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <Search size={14} className="shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </div>
            {canEdit && (
              <Organisation
                departments={teams}
                positions={jobTitles}
                workTags={workTags}
                className="group/tip relative flex w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
              >
                <Network size={15} />
                <span className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 whitespace-nowrap panel rounded-lg px-2.5 py-1.5 text-xs text-foreground opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100">
                  Departments
                </span>
              </Organisation>
            )}
          </div>
          {shownTeams.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {[{ id: "all", name: "All" }, ...shownTeams, ...(people.some((p) => p.employment === "former") ? [{ id: "former", name: "Former" }] : [])].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTeam(t.id)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    team === t.id ? "bg-hover text-foreground" : "bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {groups.map(([teamName, members]) => (
            <div key={teamName} className="mb-2">
              <p className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">{teamName}</p>
              <div className="flex flex-col gap-1">
                {members.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${
                      p.id === openId ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <Face person={p} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        {p.employment !== "active" && (
                          <span className="shrink-0 rounded-md border border-border bg-surface px-1 py-0.5 text-xs text-muted">
                            {EMPLOYMENT_LABEL[p.employment]}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted">{p.position ?? p.jobTitleName}</span>
                    </span>
                    {p.current.length > 0 && (
                      <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-xs tabular-nums text-muted">
                        {p.current.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">No one by that name.</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden panel rounded-2xl">
        {open ? (
          <PersonDetail
            key={open.id}
            person={open}
            teams={teams}
            jobTitles={jobTitles}
            workTags={workTags}
            canEdit={canEdit}
            editableTeamIds={editableTeamIds}
            isSelf={open.id === meId}
            seesLevels={seesLevels}
          />
        ) : (
          <p className="m-auto flex items-center gap-2 text-sm text-muted">
            <Users2 size={15} /> Choose someone to see their profile.
          </p>
        )}
      </section>
    </div>
  );
}
