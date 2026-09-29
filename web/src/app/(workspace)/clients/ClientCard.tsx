"use client";

import { PrefetchLink } from "../PrefetchLink";
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

// A count in one line: its icon (lit when there's something there), the
// number, and what it counts.
function Stat({ n, one, many, Icon }: { n: number; one: string; many: string; Icon: LucideIcon }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <Icon size={15} className={n > 0 ? "text-accent" : "text-muted/70"} />
      <span className={`text-[15px] font-semibold tabular-nums ${n > 0 ? "text-foreground" : "text-muted"}`}>{n}</span>
      <span className="text-xs text-muted">{n === 1 ? one : many}</span>
    </span>
  );
}

// A client at a glance: who they are and where they stand, then what's in
// motion for them — nothing else. Quiet at rest; lifts a little on hover.
export function ClientCard({ client, onStatusChange }: { client: ClientCardData; onStatusChange?: (id: string, next: string) => void }) {
  return (
    // draggable=false: an <a> is natively draggable on its own, and the
    // browser picks the innermost draggable node under the cursor for the
    // drag image — without this, dragging the card (the outer div in
    // ClientsBoard actually holds the draggable=true) showed a "you're
    // dragging a link" ghost instead of the card itself.
    <PrefetchLink
      href={clientHref(client)}
      draggable={false}
      // h-full: every card in a row the same height, its numbers on one line at the foot
      className="group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden panel panel-hover rounded-3xl p-5 hover:-translate-y-0.5"
    >
      {/* the soft glow on the ones with work in hand */}
      {client.activeProjects + client.activeTasks > 0 && <div className="glass-glow" />}

      <div className="relative flex items-center gap-3.5">
        <span className="shrink-0 rounded-full ring-1 ring-white/10 ring-offset-2 ring-offset-[#15181c]">
          <Face client={client} size={44} />
        </span>
        {/* the whole width for the name: nothing else shares its line.
            leading-6: `truncate` clips the line box, and a tighter one cut
            the descenders off names like "Courageous Leaders" */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-6 tracking-tight">{client.name}</p>
          {client.niche && <p className="truncate text-xs leading-5 text-muted">{client.niche}</p>}
        </div>
      </div>

      {/* where they stand: the status, and the plan beside it */}
      <div className="relative -ml-2 flex min-h-7 flex-wrap items-center gap-1.5">
        {/* only for whoever can change it; the board leaves it out for an editor */}
        {onStatusChange && <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} quiet />}
        {client.tags.slice(0, 2).map((t) => (
          <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
        ))}
      </div>

      <div className="relative mt-auto flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/[0.05] pt-3.5">
        <Stat n={client.activeProjects} one="active project" many="active projects" Icon={Clapperboard} />
        <Stat n={client.activeTasks} one="open task" many="open tasks" Icon={ListChecks} />
      </div>
    </PrefetchLink>
  );
}

export function ClientRow({ client, onStatusChange }: { client: ClientCardData; onStatusChange?: (id: string, next: string) => void }) {
  return (
    <PrefetchLink
      href={clientHref(client)}
      draggable={false}
      className="group flex items-center gap-4 rounded-2xl panel-soft panel-hover px-4 py-3 hover:-translate-y-px"
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
      <span className="hidden w-16 shrink-0 items-center justify-end gap-1.5 text-xs md:flex" title={`${client.activeTasks} open task${client.activeTasks === 1 ? "" : "s"}`}>
        <ListChecks size={13} className={client.activeTasks > 0 ? "text-accent" : "text-muted"} />
        <span className={`tabular-nums ${client.activeTasks > 0 ? "text-foreground" : "text-muted"}`}>{client.activeTasks}</span>
      </span>
      {onStatusChange && <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} quiet />}
      <ArrowUpRight size={15} className="hidden shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </PrefetchLink>
  );
}
