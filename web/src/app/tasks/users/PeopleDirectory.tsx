"use client";

import { useMemo, useState } from "react";
import { Search, Users2 } from "lucide-react";
import type { EmploymentStatus, Role } from "@prisma/client";
import { Avatar } from "../TaskCard";
import { PersonDetail } from "./PersonDetail";

// One finished thing, from either task system — an employee's record of
// work shouldn't depend on which board it happened to live on.
export type HistoryEntry = {
  id: string;
  title: string;
  kind: "work" | "client";
  at: string;
  context: string | null;
  tags: string[];
};

export type PersonRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  employment: EmploymentStatus;
  teamId: string | null;
  teamName: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  joinedAt: string | null;
  salary: string | null;
  notes: string | null;
  openWork: number;
  doneWork: number;
  clientLoad: number;
  history: HistoryEntry[];
};

export type Option = { id: string; name: string };

export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  former: "Former",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  core: "Core",
  employee: "Member",
};

export function Face({ person, size }: { person: { name: string; avatarUrl: string | null }; size: number }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={person.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={person.name} size={size} />
  );
}

// Roster on the left, the open record on the right — the same two-pane shape
// the chat dashboard uses, so "a list of people and the one you're looking
// at" reads the same way twice rather than twice differently.
export function PeopleDirectory({
  people,
  teams,
  jobTitles,
  canEdit,
  meId,
}: {
  people: PersonRecord[];
  teams: Option[];
  jobTitles: Option[];
  canEdit: boolean;
  meId: string;
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(people[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (team === "all" || p.teamId === team) &&
        (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.jobTitleName ?? "").toLowerCase().includes(q))
    );
  }, [people, query, team]);

  const open = people.find((p) => p.id === openId) ?? null;

  // grouped by team, because that's the question this page is usually
  // answering — "who's on Operations right now"
  const groups = useMemo(() => {
    const byTeam = new Map<string, PersonRecord[]>();
    for (const p of filtered) {
      const key = p.teamName ?? "No team";
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(p);
    }
    return [...byTeam.entries()];
  }, [filtered]);

  return (
    <div className="flex h-full gap-4">
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </div>
          {teams.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {[{ id: "all", name: "All" }, ...teams].map((t) => (
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
                      <span className="block truncate text-xs text-muted">{p.jobTitleName ?? ROLE_LABEL[p.role]}</span>
                    </span>
                    {p.openWork + p.clientLoad > 0 && (
                      <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-xs tabular-nums text-muted">
                        {p.openWork + p.clientLoad}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">Nobody by that name.</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
        {open ? (
          <PersonDetail
            key={open.id}
            person={open}
            teams={teams}
            jobTitles={jobTitles}
            canEdit={canEdit}
            isSelf={open.id === meId}
          />
        ) : (
          <p className="m-auto flex items-center gap-2 text-sm text-muted">
            <Users2 size={15} /> Pick someone to see their record.
          </p>
        )}
      </section>
    </div>
  );
}
