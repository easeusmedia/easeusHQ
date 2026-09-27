"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChartColumn, Info, LayoutDashboard, LayoutGrid, Package, PanelLeftClose, Receipt, Search, SquareKanban, type LucideIcon } from "lucide-react";
import { toggleClientsPanel } from "./clientsPanel";
import { Avatar } from "../TaskCard";
import { clientHref } from "@/lib/slug";

// logo: the logo's own address (see clientLogoSrc), not the image itself
export type SwitcherClient = { id: string; slug: string; name: string; logo: string | null };

// A client's sections, as its page's tabs (?tab=)
const SECTIONS: { key: string; label: string; Icon: LucideIcon; billing?: boolean }[] = [
  { key: "overview", label: "Overview", Icon: LayoutDashboard },
  { key: "tasks", label: "Task board", Icon: SquareKanban },
  { key: "deliverables", label: "Deliverables", Icon: Package },
  { key: "analytics", label: "Analytics", Icon: ChartColumn },
  { key: "billing", label: "Billing", Icon: Receipt, billing: true },
  { key: "info", label: "Client info", Icon: Info },
];

// The client roster down the left of the Clients section. The clients sit
// on one thin rail, a marker beside the open one; the open client unfolds
// its sections on a tree line, the path to the section you're on lit in the
// accent. Hovering another client unfolds its sections for a moment too, so
// you can go straight to its Billing, say — and it folds back when you move
// away. Lives in the shared workspace layout (see ClientSwitcherSlot), a
// true sibling of the app's own sidebar, opened and closed by width so it
// slides rather than pops.
export function ClientSwitcher({
  clients,
  current,
  onDashboard,
  shown,
  onClientPage,
  canSeeBilling,
}: {
  clients: SwitcherClient[];
  // the open client's address
  current: string | null;
  onDashboard: boolean;
  shown: boolean;
  // on the client's own page (its sections can be current), not a project's
  onClientPage: boolean;
  canSeeBilling: boolean;
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [peek, setPeek] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sections = SECTIONS.filter((s) => !s.billing || canSeeBilling);
  const tab = params.get("tab") ?? "overview";
  const shownClients = query.trim() ? clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())) : clients;
  // the client whose sections are out: the one hovered a moment, else the open one
  const open = peek ?? current;

  const hover = (slug: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(slug), slug ? 180 : 250);
  };

  return (
    <aside
      aria-hidden={!shown}
      // not focusable or clickable while it's slid shut
      inert={!shown}
      className={`sticky top-0 hidden h-screen shrink-0 overflow-hidden bg-background transition-[width,opacity] duration-200 ease-in-out lg:block ${
        shown ? "w-60 border-r border-white/[0.06] opacity-100" : "w-0 opacity-0"
      }`}
    >
      <div className="flex h-full w-60 flex-col px-3 pb-3 pt-3">
        {/* level with the rail's logo row */}
        <div className="mb-3 flex h-9 shrink-0 items-center justify-between pl-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            Clients
            <span className="rounded-full bg-white/[0.05] px-1.5 py-px text-[11px] font-normal tabular-nums text-muted">{clients.length}</span>
          </span>
          <button
            type="button"
            onClick={toggleClientsPanel}
            title="Hide clients"
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <label className="mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 transition-colors focus-within:border-accent/40">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a client"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none! placeholder:text-muted/70"
          />
        </label>

        <Link
          href="/clients"
          className={`mb-3 flex h-9 shrink-0 items-center gap-2.5 rounded-xl px-2 text-sm transition-colors duration-150 ${
            onDashboard ? "bg-accent/[0.12] text-foreground" : "text-muted hover:bg-white/[0.04] hover:text-foreground"
          }`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center">
            <LayoutGrid size={15} className={onDashboard ? "text-accent" : ""} />
          </span>
          All clients
        </Link>

        {/* the rail the clients hang from */}
        <nav className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1" onMouseLeave={() => hover(null)}>
          <div className="relative ml-1.5 flex flex-col border-l border-white/[0.06] pl-2">
            {shownClients.map((c) => {
              const active = current === c.slug;
              const unfolded = open === c.slug;
              const activeIndex = active && onClientPage ? sections.findIndex((s) => s.key === tab) : -1;
              return (
                <div key={c.id} className="relative" onMouseEnter={() => hover(c.slug)}>
                  {/* the open client's marker on the rail */}
                  <span
                    className={`absolute -left-[9.5px] top-2 h-5 w-0.5 rounded-full bg-accent transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
                  />
                  <Link
                    href={clientHref(c)}
                    className={`flex h-9 items-center gap-2.5 rounded-xl px-2 text-sm transition-colors duration-150 ${
                      active ? "text-foreground" : unfolded ? "text-foreground/90" : "text-muted hover:text-foreground"
                    } ${active && !onClientPage ? "bg-white/[0.04]" : "hover:bg-white/[0.04]"}`}
                  >
                    {c.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
                      <img src={c.logo} alt="" className="photo size-6 shrink-0" />
                    ) : (
                      <Avatar name={c.name} size={24} presence={false} />
                    )}
                    <span className={`truncate ${active ? "font-medium" : ""}`}>{c.name}</span>
                  </Link>

                  {/* its sections, on a tree line — unfolding smoothly */}
                  <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${unfolded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden">
                      <ul className="ml-[19px] pb-1.5">
                        {sections.map((s, i) => {
                          const on = i === activeIndex;
                          // the line lights up from the top down to the section you're on
                          const lit = activeIndex >= 0 && i <= activeIndex;
                          return (
                            <li key={s.key} className="relative">
                              {/* the line down to this row, and its curve into it — its
                                  bottom edge on the 32px row's centre line */}
                              <span className={`absolute left-0 top-0 h-4 w-3 rounded-bl-lg border-b border-l ${lit ? "border-accent/70" : "border-white/[0.08]"}`} />
                              {i < sections.length - 1 && (
                                <span className={`absolute bottom-0 left-0 top-4 w-px ${activeIndex > i ? "bg-accent/70" : "bg-white/[0.08]"}`} />
                              )}
                              <Link
                                href={`${clientHref(c)}${s.key === "overview" ? "" : `?tab=${s.key}`}`}
                                className={`ml-4 flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-150 ${
                                  on ? "font-medium text-foreground" : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                                }`}
                              >
                                <s.Icon size={14} className={on ? "text-accent" : ""} />
                                {s.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
            {shownClients.length === 0 && <p className="px-2 py-4 text-xs text-muted">No client by that name.</p>}
          </div>
        </nav>
      </div>
    </aside>
  );
}
