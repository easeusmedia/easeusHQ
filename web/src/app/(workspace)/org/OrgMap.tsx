"use client";

import { ArrowUpRight, Clock, ListChecks, Users } from "lucide-react";
import { PrefetchLink } from "../PrefetchLink";
import { Avatar } from "../TaskCard";
import { StatTile } from "../StatTile";

export type MapDepartment = { slug: string; name: string; open: number; late: number; members: string[] };

// The company at a glance: its people and its open and late work, then a card
// a department, each with a bar as long as its open work (against the
// busiest), the late part in rose, and its people. A card opens its page.
export function OrgMap({ departments, people }: { departments: MapDepartment[]; people: number }) {
  const open = departments.reduce((s, d) => s + d.open, 0);
  const late = departments.reduce((s, d) => s + d.late, 0);
  const most = Math.max(1, ...departments.map((d) => d.open));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="People" value={people} Icon={Users} />
        <StatTile label="Open" value={open} Icon={ListChecks} />
        <StatTile label="Late" value={late} Icon={Clock} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departments.map((d) => (
          <Card key={d.slug} d={d} most={most} />
        ))}
      </div>
    </div>
  );
}

function Card({ d, most }: { d: MapDepartment; most: number }) {
  const shown = d.members.slice(0, 5);
  return (
    <PrefetchLink href={`/org/${d.slug}`} className="group relative flex flex-col gap-5 overflow-hidden panel panel-hover rounded-3xl p-5 hover:-translate-y-0.5">
      {d.open > 0 && <div className="glass-glow" />}

      <div className="relative flex items-center gap-3.5">
        <span className="shrink-0 rounded-full ring-1 ring-white/10 ring-offset-2 ring-offset-[#15181c]">
          <Avatar name={d.name} size={40} presence={false} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[15px] leading-6 font-medium tracking-tight">{d.name}</p>
        <ArrowUpRight size={16} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="relative flex flex-col gap-2.5">
        <div className="flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-semibold tracking-tight tabular-nums ${d.open ? "text-foreground" : "text-muted"}`}>{d.open}</span>
            <span className="text-xs text-muted">open</span>
          </p>
          {d.late > 0 && <span className="mb-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 tabular-nums">{d.late} late</span>}
        </div>
        {/* the work against the busiest department: on time in blue, late in rose */}
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/[0.05]">
          {d.open > d.late && <span className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((d.open - d.late) / most) * 100}%` }} />}
          {d.late > 0 && <span className="h-full rounded-full bg-rose-400/80 transition-[width] duration-500" style={{ width: `${(d.late / most) * 100}%` }} />}
        </div>
      </div>

      <div className="relative mt-auto flex items-center gap-3 border-t border-white/[0.05] pt-3.5">
        {shown.length > 0 && (
          <span className="flex -space-x-1.5">
            {shown.map((name) => (
              <span key={name} className="rounded-full ring-2 ring-[#15181c]">
                <Avatar name={name} size={24} presence={false} />
              </span>
            ))}
          </span>
        )}
        <span className="text-xs text-muted">
          {d.members.length} {d.members.length === 1 ? "person" : "people"}
        </span>
      </div>
    </PrefetchLink>
  );
}
