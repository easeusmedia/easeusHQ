"use client";

import Link from "next/link";
import { ArrowUpRight, Clapperboard, ListChecks, type LucideIcon } from "lucide-react";
import { clientHref } from "@/lib/slug";
import { Avatar } from "../TaskCard";
import { TagPill } from "./TagPill";
import { StatusDropdown } from "./StatusDropdown";

export type ClientCardData = {
  id: string;
  slug: string;
  name: string;
  status: string;
  sortOrder: number;
  niche: string | null;
  // the logo's own address (see clientLogoSrc), not the image itself
  logo: string | null;
  tags: { id: string; name: string; color: string }[];
  activeProjects: number;
  activeTasks: number;
};

function Face({ client, size }: { client: ClientCardData; size: number }) {
  return client.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
    <img src={client.logo} alt="" className="photo" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={client.name} size={size} />
  );
}

// leading-6 rather than leading-tight: `truncate` clips the overflow box,
// and a tight line box cut the descenders off names like "Courageous
// Leaders" and "Robyn".
// A count with its small icon badge — lit when there's something there, the
// way the Contracts tiles are
function Stat({ n, label, Icon }: { n: number; label: string; Icon: LucideIcon }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${n > 0 ? "bg-white/[0.06] text-foreground/80" : "bg-white/[0.04] text-muted"}`}>
        <Icon size={14} />
      </span>
      <span className="flex flex-col">
        <span className={`text-base font-semibold leading-5 tabular-nums ${n > 0 ? "" : "text-muted"}`}>{n}</span>
        <span className="text-[11px] leading-4 text-muted">{label}</span>
      </span>
    </span>
  );
}

export function ClientCard({ client, onStatusChange }: { client: ClientCardData; onStatusChange?: (id: string, next: string) => void }) {
  return (
    // draggable=false: an <a> is natively draggable on its own, and the
    // browser picks the innermost draggable node under the cursor for the
    // drag image — without this, dragging the card (the outer div in
    // ClientsBoard actually holds the draggable=true) showed a "you're
    // dragging a link" ghost instead of the card itself.
    <Link
      href={clientHref(client)}
      draggable={false}
      className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/50 p-5 transition-all duration-200 hover:-translate-y-px hover:border-white/[0.12] hover:bg-surface/70"
    >
      <ArrowUpRight size={15} className="absolute right-4 top-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-3 pr-5">
        <Face client={client} size={42} />
        {/* full width to itself — the status dropdown used to sit in this
            row and ate into it, truncating names that didn't need to be */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-6">{client.name}</p>
          {client.niche && <p className="truncate text-xs leading-5 text-muted">{client.niche}</p>}
        </div>
      </div>

      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {client.tags.slice(0, 3).map((t) => (
            <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
          ))}
        </div>
        <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} />
      </div>

      <div className="mt-auto flex items-center gap-5 border-t border-white/[0.06] pt-3.5">
        <Stat n={client.activeProjects} label={client.activeProjects === 1 ? "active project" : "active projects"} Icon={Clapperboard} />
        <Stat n={client.activeTasks} label={client.activeTasks === 1 ? "active task" : "active tasks"} Icon={ListChecks} />
      </div>
    </Link>
  );
}

export function ClientRow({ client, onStatusChange }: { client: ClientCardData; onStatusChange?: (id: string, next: string) => void }) {
  return (
    <Link
      href={clientHref(client)}
      draggable={false}
      className="group flex items-center gap-4 rounded-2xl border border-white/[0.05] bg-surface/40 px-4 py-3 transition-all duration-200 hover:-translate-y-px hover:border-white/[0.1] hover:bg-surface/70"
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
      <span className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs" title={`${client.activeProjects} active project${client.activeProjects === 1 ? "" : "s"}`}>
        <Clapperboard size={13} className={client.activeProjects > 0 ? "text-accent" : "text-muted"} />
        <span className={`tabular-nums ${client.activeProjects > 0 ? "text-foreground" : "text-muted"}`}>{client.activeProjects}</span>
      </span>
      <span className="hidden w-16 shrink-0 items-center justify-end gap-1.5 text-xs md:flex" title={`${client.activeTasks} active task${client.activeTasks === 1 ? "" : "s"}`}>
        <ListChecks size={13} className={client.activeTasks > 0 ? "text-accent" : "text-muted"} />
        <span className={`tabular-nums ${client.activeTasks > 0 ? "text-foreground" : "text-muted"}`}>{client.activeTasks}</span>
      </span>
      <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} />
      <ArrowUpRight size={15} className="hidden shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </Link>
  );
}
