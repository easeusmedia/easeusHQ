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

// A count in one line: its icon (lit and softly glowing when there's
// something there), the number, and what it counts.
function Stat({ n, one, many, Icon }: { n: number; one: string; many: string; Icon: LucideIcon }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <Icon size={15} className={n > 0 ? "icon-glow" : "icon-soft text-muted/70"} />
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
      className="group relative flex min-w-0 flex-col gap-6 panel panel-hover rounded-3xl p-5 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3.5">
        <span className="shrink-0 rounded-full ring-1 ring-white/10 ring-offset-2 ring-offset-[#15181c]">
          <Face client={client} size={44} />
        </span>
        {/* leading-6: `truncate` clips the line box, and a tighter one cut
            the descenders off names like "Courageous Leaders" */}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-medium leading-6 tracking-tight">{client.name}</p>
          {client.niche && <p className="truncate text-xs leading-5 text-muted">{client.niche}</p>}
        </div>
        <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} quiet />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Stat n={client.activeProjects} one="active project" many="active projects" Icon={Clapperboard} />
          <Stat n={client.activeTasks} one="open task" many="open tasks" Icon={ListChecks} />
        </div>
        {client.tags.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {client.tags.slice(0, 2).map((t) => (
              <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
            ))}
          </div>
        )}
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
        <Clapperboard size={13} className={client.activeProjects > 0 ? "icon-glow" : "icon-soft text-muted"} />
        <span className={`tabular-nums ${client.activeProjects > 0 ? "text-foreground" : "text-muted"}`}>{client.activeProjects}</span>
      </span>
      <span className="hidden w-16 shrink-0 items-center justify-end gap-1.5 text-xs md:flex" title={`${client.activeTasks} open task${client.activeTasks === 1 ? "" : "s"}`}>
        <ListChecks size={13} className={client.activeTasks > 0 ? "icon-glow" : "icon-soft text-muted"} />
        <span className={`tabular-nums ${client.activeTasks > 0 ? "text-foreground" : "text-muted"}`}>{client.activeTasks}</span>
      </span>
      <StatusDropdown clientId={client.id} status={client.status} onChange={onStatusChange} quiet />
      <ArrowUpRight size={15} className="hidden shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </PrefetchLink>
  );
}
