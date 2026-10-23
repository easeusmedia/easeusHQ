"use client";

import { createElement, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { PrefetchLink } from "../PrefetchLink";
import { Avatar } from "../TaskCard";
import { markOf } from "./marks";
import { STAGE } from "@/lib/stages";
import type { TaskStatus } from "@/lib/workflow";
import { EditableName } from "../EditableName";
import { renameTeam, reorderDepartments } from "./space/actions";
import { moveTo } from "@/lib/reorder";

export type MapPerson = { name: string; on: string | null; status: TaskStatus | null; open: number; late: number; leads: number };
// canRename: Level 1 and the department's Leads (set by the page)
export type MapDepartment = { id: string; slug: string; name: string; open: number; late: number; leads: number | null; people: MapPerson[]; canRename?: boolean };

// A count as a small pill: blue for work in hand, rose for late, grey else
const PILL = { open: "bg-accent/10 text-accent", late: "bg-rose-500/10 text-rose-300", plain: "bg-white/[0.05] text-muted" };
function Pill({ n, label, tone }: { n: number; label: string; tone: keyof typeof PILL }) {
  return <span className={`rounded-full px-2 py-0.5 text-[12px] whitespace-nowrap tabular-nums ${PILL[tone]}`}>{`${n} ${label}`}</span>;
}

// The company at a glance: a panel a department, its people up front with
// what each is on. The departments come in their own order, the sidebar's
// (Abhishek, 23 Oct 2026), which whoever sets the app up changes by
// dragging a panel. The department with the most people gets the wide
// panel; one with no one in it yet is slim. A panel opens its department.
export function OrgMap({ departments, canReorder = false }: { departments: MapDepartment[]; canReorder?: boolean }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  // the order while a drag is in flight, so panels make room under the cursor
  const [preview, setPreview] = useState<string[] | null>(null);
  // the order just dropped, until the page brings it back
  const [dropped, setDropped] = useState<{ base: MapDepartment[]; ids: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(departments.map((d) => [d.id, d]));
  const settled = dropped?.base === departments ? dropped.ids : departments.map((d) => d.id);
  const ids = preview ?? settled;
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  const staffed = departments.filter((d) => d.people.length > 0);
  const widest = staffed.reduce<MapDepartment | null>((w, d) => (!w || d.people.length > w.people.length ? d : w), null);

  // over another panel: slot the dragged one before or after it, by which
  // half the cursor is over (the grid reads across)
  function hover(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    if (!dragging) return;
    e.preventDefault();
    if (dragging === targetId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const next = moveTo(ids, dragging, targetId, e.clientX > r.left + r.width / 2);
    if (next.join() !== ids.join()) setPreview(next);
  }
  async function drop() {
    const order = preview;
    setDragging(null);
    setPreview(null);
    if (!order || order.join() === settled.join()) return;
    setError(null);
    setDropped({ base: departments, ids: order });
    const res = await reorderDepartments(order);
    if (res.error) {
      setDropped(null);
      setError(res.error);
    } else router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="@container">
        <div
          className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3"
          onDragOver={(e) => dragging && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            drop();
          }}
        >
          {ordered.map((d) => (
            <div
              key={d.slug}
              draggable={canReorder}
              onDragStart={(e) => {
                setDragging(d.id);
                e.dataTransfer.effectAllowed = "move";
                // without this Firefox won't fire onDrop
                e.dataTransfer.setData("text/plain", d.id);
              }}
              onDragOver={(e) => hover(e, d.id)}
              // a drag that's cancelled (Esc, dropped outside) puts everything back
              onDragEnd={() => {
                setDragging(null);
                setPreview(null);
              }}
              className={`min-w-0 transition-opacity duration-200 ${d === widest && staffed.length > 1 ? "@2xl:col-span-2" : ""} ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === d.id ? "opacity-40" : ""}`}
            >
              <Department d={d} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Department({ d }: { d: MapDepartment }) {
  const router = useRouter();
  // Level 1 and its Leads can rename it, right here
  const rename = async (name: string) => {
    const res = await renameTeam(d.id, name);
    if (res.error) return res.error;
    router.refresh();
  };
  const slim = d.people.length === 0;
  return (
    <PrefetchLink
      href={`/org/${d.slug}`}
      className={`@container group relative flex h-full min-w-0 flex-col overflow-hidden panel panel-hover rounded-3xl hover:-translate-y-0.5 ${slim ? "px-5 py-4" : "gap-3 p-5"}`}
    >
      {d.open > 0 && <div className="glass-glow" />}
      <div className="relative flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl badge-lit">{createElement(markOf(d.name), { size: 16 })}</span>
        <p className="min-w-0 flex-1 text-base leading-snug font-semibold tracking-tight">
          {d.canRename ? <EditableName name={d.name} onSave={rename} pencil="hover" /> : d.name}
        </p>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {slim && <span className="text-xs text-muted">No one in it yet</span>}
          {d.leads !== null && <Pill n={d.leads} label={d.leads === 1 ? "lead" : "leads"} tone="plain" />}
          {!slim && <Pill n={d.open} label="open" tone={d.open ? "open" : "plain"} />}
          {d.late > 0 && <Pill n={d.late} label="late" tone="late" />}
        </span>
        <ArrowUpRight size={15} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {!slim && (
        <ul className="relative grid gap-x-8 @xl:grid-cols-2">
          {d.people.map((p) => (
            <li key={p.name} className="flex min-w-0 items-center gap-3 border-t border-white/[0.05] py-2.5">
              <Avatar name={p.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  {p.status && <span className={`shrink-0 rounded-full border px-1.5 text-[11.5px] leading-4 ${STAGE[p.status].pill}`}>{STAGE[p.status].label}</span>}
                  <span className="truncate">{p.on ?? "Nothing assigned"}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {p.leads > 0 && <Pill n={p.leads} label={p.leads === 1 ? "lead" : "leads"} tone="plain" />}
                {p.open > 0 && <Pill n={p.open} label="open" tone="open" />}
                {p.late > 0 && <Pill n={p.late} label="late" tone="late" />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PrefetchLink>
  );
}
