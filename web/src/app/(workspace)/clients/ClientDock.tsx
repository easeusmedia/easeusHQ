"use client";

import { PrefetchLink } from "../PrefetchLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clientHref } from "@/lib/slug";
import { CLIENTS_SECTION, useActiveClient } from "./clientsPanel";
import { ClientFace, type SidebarClient } from "../Sidebar";

// A bar of every current client's face along the foot of a client's page (or
// one of their projects) — one click moves you across to another client. The
// one you're on is the selected pill with its name; the others name
// themselves on hover. Everything eases over half a second: the pill fades
// across and the names fold and unfold together, starting the moment you
// click rather than when the next page has loaded.
export function ClientDock({ clients }: { clients: SidebarClient[] }) {
  const pathname = usePathname();
  const activeClient = useActiveClient();
  const slug = pathname.match(CLIENTS_SECTION)?.[1];
  const onProject = pathname.startsWith("/projects/");
  // the one just clicked, until its page arrives
  const [picked, setPicked] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setPicked(null);
  }
  if ((!slug && !onProject) || clients.length < 2) return null;
  const current = picked ?? slug ?? activeClient;
  const EASE = "duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]";

  return (
    // data-dock: the page above makes room for it (see layout.tsx)
    <div data-dock className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      {/* ponytail: no scrolling — a scroller would clip the names above the
          faces. Fine for a couple of dozen clients; past that, scroll it */}
      <nav aria-label="Clients" className="panel pop-in pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl p-1.5">
        {clients.map((c) => {
          const on = c.slug === current;
          return (
            <PrefetchLink
              key={c.id}
              href={clientHref(c)}
              onClick={() => setPicked(c.slug)}
              aria-current={on ? "page" : undefined}
              // isolate: the pill and hover layers sit behind the face and name
              className="group relative isolate flex h-10 items-center rounded-xl border border-transparent px-[7px]"
            >
              {/* the pill, on every item and faded in on the current one — a
                  gradient can't be transitioned, its opacity can */}
              <span aria-hidden className={`selected absolute -inset-px -z-10 rounded-xl transition-opacity ${EASE} ${on ? "opacity-100" : "opacity-0"}`} />
              <span aria-hidden className="absolute -inset-px -z-20 rounded-xl bg-white/[0.05] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <ClientFace client={c} size={26} />
              {/* the current one's name, opening out beside its face — a grid
                  column eased from 0fr to 1fr grows to the name's own width,
                  where a max-width would race through the first part and
                  sit still for the rest */}
              <span className={`grid transition-[grid-template-columns,opacity,margin] ${EASE} ${on ? "ml-2 mr-1 grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0"}`}>
                <span className="overflow-hidden whitespace-nowrap text-[14px] font-medium">{c.name}</span>
              </span>
              {!on && (
                <span
                  aria-hidden
                  className="panel pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium opacity-0 transition-[opacity,translate] duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100"
                >
                  {c.name}
                </span>
              )}
            </PrefetchLink>
          );
        })}
      </nav>
    </div>
  );
}
