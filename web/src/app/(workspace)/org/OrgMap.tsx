"use client";

import { createElement } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { PrefetchLink } from "../PrefetchLink";
import { Avatar } from "../TaskCard";
import { markOf } from "./marks";
import { EditableName } from "../EditableName";
import { renameTeam } from "./space/actions";

export type MapPerson = { name: string; on: string | null; stage: string | null; open: number; late: number; leads: number };
export type MapDepartment = { id: string; slug: string; name: string; open: number; late: number; leads: number | null; people: MapPerson[] };

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// The company at a glance: a panel a department, its people up front with
// what each is on. The department with the most people gets the wide panel,
// first. A panel opens its department.
export function OrgMap({ departments }: { departments: MapDepartment[] }) {
  const widest = departments.reduce((w, d) => (d.people.length > w.people.length ? d : w), departments[0]);
  // the wide one first, then the rest in order
  const panels = [widest, ...departments.filter((d) => d !== widest)].map((d) => <Department key={d.slug} d={d} wide={d === widest && departments.length > 1} />);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
      <div className="@container">
        <div className="grid grid-flow-dense gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">{panels}</div>
      </div>
    </div>
  );
}

function Department({ d, wide }: { d: MapDepartment; wide: boolean }) {
  const router = useRouter();
  // anyone in the department can rename it, right here
  const rename = async (name: string) => {
    const res = await renameTeam(d.id, name);
    if (res.error) return res.error;
    router.refresh();
  };
  return (
    <PrefetchLink
      href={`/org/${d.slug}`}
      className={`@container group relative flex min-w-0 flex-col gap-4 overflow-hidden panel panel-hover rounded-3xl p-5 hover:-translate-y-0.5 ${wide ? "@2xl:col-span-2" : ""}`}
    >
      {d.open > 0 && <div className="glass-glow" />}
      <div className="relative flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg badge-lit">{createElement(markOf(d.name), { size: 15 })}</span>
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-medium tracking-tight">
          <EditableName name={d.name} onSave={rename} pencil="hover" />
        </p>
        <p className="shrink-0 text-xs text-muted tabular-nums">
          {d.leads !== null && <span>{plural(d.leads, "lead")} · </span>}
          {d.open} open{d.late > 0 && <span className="text-rose-300"> · {d.late} late</span>}
        </p>
        <ArrowUpRight size={15} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {d.people.length > 0 ? (
        <ul className="relative grid gap-x-6 gap-y-1 @xl:grid-cols-2">
          {d.people.map((p) => (
            <li key={p.name} className="flex min-w-0 items-center gap-3 rounded-xl py-1.5">
              <Avatar name={p.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted">{p.on ? (p.stage ? `${p.stage} · ${p.on}` : p.on) : "Free"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
                {p.leads > 0 && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-muted">{plural(p.leads, "lead")}</span>}
                {p.open > 0 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{p.open}</span>}
                {p.late > 0 && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-300">{p.late} late</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="relative text-xs text-muted">No one yet</p>
      )}
    </PrefetchLink>
  );
}
