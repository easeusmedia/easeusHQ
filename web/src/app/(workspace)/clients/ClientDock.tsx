"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clientHref } from "@/lib/slug";
import { CLIENTS_SECTION, useActiveClient } from "./clientsPanel";
import { ClientFace, type SidebarClient } from "../Sidebar";

// A bar of every current client's face along the foot of a client's page (or
// one of their projects) — one click moves you across to another client. The
// one you're on is the selected pill with its name; the others name
// themselves on hover.
export function ClientDock({ clients }: { clients: SidebarClient[] }) {
  const pathname = usePathname();
  const activeClient = useActiveClient();
  const slug = pathname.match(CLIENTS_SECTION)?.[1];
  const onProject = pathname.startsWith("/projects/");
  if ((!slug && !onProject) || clients.length < 2) return null;
  const current = slug ?? activeClient;

  return (
    // data-dock: the page above makes room for it (see layout.tsx)
    <div data-dock className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      {/* ponytail: no scrolling — a scroller would clip the names above the
          faces. Fine for a couple of dozen clients; past that, scroll it */}
      <nav aria-label="Clients" className="panel pop-in pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl p-1.5">
        {clients.map((c) => {
          const on = c.slug === current;
          return (
            <Link
              key={c.id}
              href={clientHref(c)}
              aria-current={on ? "page" : undefined}
              className={`group relative flex h-10 items-center rounded-xl border px-[7px] transition-colors duration-150 ${
                on ? "selected" : "border-transparent hover:bg-white/[0.05]"
              }`}
            >
              <ClientFace client={c} size={26} />
              {/* the current one's name, opening out beside its face */}
              <span
                className={`overflow-hidden whitespace-nowrap text-[13px] font-medium transition-[max-width,opacity,margin] duration-200 ease-in-out ${
                  on ? "ml-2 mr-1 max-w-40 opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                {c.name}
              </span>
              {!on && (
                <span
                  aria-hidden
                  className="panel pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100"
                >
                  {c.name}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
