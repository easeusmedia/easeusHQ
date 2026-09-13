"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "./TaskCard";
import { TeamPanel } from "./team/TeamPanel";
import { ACTIVE_WINDOW_MS } from "./team/constants";
import { useHeaderTitle } from "./HeaderTitle";

type Person = { id: string; name: string; role: string; avatarUrl: string | null; lastSeenAt: Date | null };

// Static routes resolve their title instantly from the URL — no flash.
// Dynamic ones (a client's name, a project's name) start from the nearest
// static ancestor here and get overridden a moment later by that page's
// own <SetHeaderTitle>.
function titleFromPath(pathname: string): string {
  const base = pathname.startsWith("/tasks/preview") ? pathname.replace("/tasks/preview", "/tasks") : pathname;
  if (base === "/tasks") return "Task Management";
  if (base === "/tasks/history") return "History";
  if (base === "/tasks/calendar") return "Calendar";
  if (base === "/tasks/users") return "Users";
  if (base === "/tasks/clients/template") return "Client Template";
  if (base.startsWith("/tasks/clients")) return "Clients";
  if (base.startsWith("/tasks/projects")) return "Projects";
  return "Easeus HQ";
}

function isActive(p: Person) {
  return !!p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
}

export function Header({
  people,
  meId,
  unreadBySender,
}: {
  people: Person[];
  meId: string;
  unreadBySender: Record<string, number>;
}) {
  const pathname = usePathname();
  const announced = useHeaderTitle();
  const title = announced ?? titleFromPath(pathname);
  const [panelOpen, setPanelOpen] = useState(false);
  const unreadCount = Object.values(unreadBySender).reduce((a, b) => a + b, 0);

  const roster = people.filter((p) => p.id !== meId);
  const active = roster.filter(isActive);
  // active faces first, then whoever else, so the stack favors "who's
  // actually here right now" over an arbitrary alphabetical slice
  const shown = [...active, ...roster.filter((p) => !isActive(p))].slice(0, 3);
  const overflow = roster.length - shown.length;

  return (
    <>
      {/* mb-4/text-xl, not the mb-6/text-2xl a one-off page heading could
          afford — this now sits above every page's own content (the Board
          included, which used to start right at the container's top
          padding with nothing above it), so its footprint had to shrink
          to match, not add a second heading's worth of height on top */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

        {roster.length > 0 && (
          <button onClick={() => setPanelOpen(true)} className="group relative flex items-center" title="Team">
            <span className="flex -space-x-2.5">
              {shown.map((p) => (
                <span key={p.id} className="rounded-full ring-2 ring-background">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
                    <img src={p.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <Avatar name={p.name} size={32} />
                  )}
                </span>
              ))}
              {overflow > 0 && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-muted ring-2 ring-background">
                  +{overflow}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white ring-2 ring-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {panelOpen && (
        <TeamPanel people={roster} meId={meId} unreadBySender={unreadBySender} onClose={() => setPanelOpen(false)} />
      )}
    </>
  );
}
