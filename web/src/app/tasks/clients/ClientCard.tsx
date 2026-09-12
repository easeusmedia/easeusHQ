"use client";

import Link from "next/link";
import { Avatar } from "../TaskCard";
import { TagPill } from "./TagPill";

export type ClientCardData = {
  id: string;
  name: string;
  status: string;
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

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// The whole card is the link — clicking anywhere opens the client. Three
// things on it and no more: who they are, what kind of client, how much is
// live. Everything else is on their page.
export function ClientCard({ client }: { client: ClientCardData }) {
  return (
    <Link
      href={`/tasks/clients/${client.id}`}
      className="card-surface flex h-40 min-w-0 flex-col rounded-2xl p-5 shadow-sm"
    >
      <Face client={client} size={40} />
      <p className="mt-3 min-w-0 truncate text-[15px] font-semibold leading-tight">{client.name}</p>
      <p className="mt-1 text-xs text-muted">{count(client.activeProjects, "active project", "active projects")}</p>

      <div className="mt-auto flex min-h-[20px] flex-wrap gap-1">
        {client.tags.slice(0, 3).map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>
    </Link>
  );
}

export function ClientRow({ client }: { client: ClientCardData }) {
  return (
    <Link
      href={`/tasks/clients/${client.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3 hover:bg-surface-2"
    >
      <Face client={client} size={30} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</p>
      <div className="hidden shrink-0 flex-wrap gap-1 sm:flex">
        {client.tags.slice(0, 3).map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>
      <span className="w-32 shrink-0 text-right text-xs text-muted">
        {count(client.activeProjects, "active project", "active projects")}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-muted md:block">
        {count(client.activeTasks, "task", "tasks")}
      </span>
    </Link>
  );
}
