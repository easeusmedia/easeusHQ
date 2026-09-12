"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Avatar } from "../TaskCard";
import { TagPill } from "./TagPill";

export type ClientCardData = {
  id: string;
  name: string;
  status: string;
  avatarUrl: string | null;
  tags: { id: string; name: string; color: string }[];
  projects: { id: string; type: string; activeTasks: number }[];
  activeTasks: number;
  delivered: number;
};

function Face({ client, size }: { client: ClientCardData; size: number }) {
  return client.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={client.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={client.name} size={size} />
  );
}

function Stat({ n, label, plural }: { n: number; label: string; plural?: string }) {
  return (
    <span className="text-xs text-muted">
      <span className={`font-medium tabular-nums ${n > 0 ? "text-foreground" : ""}`}>{n}</span>{" "}
      {n === 1 ? label : plural ?? `${label}s`}
    </span>
  );
}

// What the expand reveals in both views: which projects are live and where
// the work sits, plus the way through to the full client page.
function Details({ client }: { client: ClientCardData }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-2.5">
      {client.projects.length === 0 ? (
        <p className="text-xs text-muted">No projects yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {client.projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{p.type}</span>
              <span className="shrink-0 text-muted">{p.activeTasks} active</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/tasks/clients/${client.id}`}
        className="btn-glow flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
      >
        Open client <ArrowRight size={13} />
      </Link>
    </div>
  );
}

// Fixed grid track + h-full means every card in a row is the same size; the
// tag strip keeps its height even when a client has no tags, so cards don't
// end up ragged.
export function ClientCard({
  client,
  expanded,
  onToggle,
}: {
  client: ClientCardData;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card-surface flex h-full min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl p-3.5 shadow-sm" onClick={onToggle}>
      <div className="flex items-center gap-2.5">
        <Face client={client} size={36} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</p>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      <div className="flex min-h-[20px] flex-wrap gap-1">
        {client.tags.map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stat n={client.projects.length} label="project" />
        <Stat n={client.activeTasks} label="active task" />
        <Stat n={client.delivered} label="delivered" plural="delivered" />
      </div>

      {expanded && <Details client={client} />}
    </div>
  );
}

export function ClientRow({
  client,
  expanded,
  onToggle,
}: {
  client: ClientCardData;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <div className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-2" onClick={onToggle}>
        <Face client={client} size={28} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</p>
        <div className="hidden shrink-0 flex-wrap gap-1 sm:flex">
          {client.tags.map((t) => (
            <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
          ))}
        </div>
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <Stat n={client.projects.length} label="project" />
          <Stat n={client.activeTasks} label="active task" />
          <Stat n={client.delivered} label="delivered" plural="delivered" />
        </div>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>
      {expanded && (
        <div className="px-3 pb-3">
          <Details client={client} />
        </div>
      )}
    </div>
  );
}
