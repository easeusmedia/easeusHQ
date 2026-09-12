"use client";

import Link from "next/link";
import { Avatar } from "../TaskCard";
import { TagPill } from "./TagPill";

export type ClientCardData = {
  id: string;
  name: string;
  status: string;
  niche: string | null;
  avatarUrl: string | null;
  tags: { id: string; name: string; color: string }[];
  activeProjects: number;
  activeTasks: number;
};

function Face({ client, size }: { client: ClientCardData; size: number }) {
  return client.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={client.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={client.name} size={size} />
  );
}

// leading-6 rather than leading-tight: `truncate` clips the overflow box,
// and a tight line box cut the descenders off names like "Courageous
// Leaders" and "Robyn".
function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex flex-col">
      <span className={`text-lg font-semibold leading-6 tabular-nums ${n > 0 ? "" : "text-muted"}`}>{n}</span>
      <span className="text-[11px] leading-4 text-muted">{label}</span>
    </span>
  );
}

export function ClientCard({ client }: { client: ClientCardData }) {
  return (
    <Link
      href={`/tasks/clients/${client.id}`}
      className="card-surface card-interactive flex min-w-0 flex-col gap-3 rounded-2xl p-5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <Face client={client} size={42} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-6">{client.name}</p>
          {client.niche && <p className="truncate text-xs leading-5 text-muted">{client.niche}</p>}
        </div>
      </div>

      <div className="flex min-h-[22px] flex-wrap gap-1">
        {client.tags.slice(0, 3).map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>

      <div className="mt-auto flex items-center gap-6 border-t border-border/60 pt-3">
        <Stat n={client.activeProjects} label={client.activeProjects === 1 ? "active project" : "active projects"} />
        <Stat n={client.activeTasks} label={client.activeTasks === 1 ? "active task" : "active tasks"} />
      </div>
    </Link>
  );
}

export function ClientRow({ client }: { client: ClientCardData }) {
  return (
    <Link
      href={`/tasks/clients/${client.id}`}
      className="flex items-center gap-4 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 hover:bg-surface-2"
    >
      <Face client={client} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5">{client.name}</p>
        {client.niche && <p className="truncate text-xs leading-4 text-muted">{client.niche}</p>}
      </div>
      <div className="hidden shrink-0 flex-wrap gap-1 sm:flex">
        {client.tags.slice(0, 3).map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>
      <span className="w-28 shrink-0 text-right text-xs text-muted">
        <span className={client.activeProjects > 0 ? "text-foreground" : ""}>{client.activeProjects}</span> active
        {client.activeProjects === 1 ? " project" : " projects"}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-muted md:block">
        <span className={client.activeTasks > 0 ? "text-foreground" : ""}>{client.activeTasks}</span> active
        {client.activeTasks === 1 ? " task" : " tasks"}
      </span>
    </Link>
  );
}
