"use client";

import Link from "next/link";
import { LayoutGrid, PanelLeftClose } from "lucide-react";
import { toggleClientsPanel } from "./clientsPanel";
import { Avatar } from "../TaskCard";
import { clientHref } from "@/lib/slug";

// logo: the logo's own address (see clientLogoSrc), not the image itself
export type SwitcherClient = { id: string; slug: string; name: string; logo: string | null };

// The client roster down the left of the Clients section — jump straight
// to another client, or back to all of them, without leaving the page
// you're on. Lives in the shared workspace layout (see ClientSwitcherSlot), as
// a true sibling of the app's own sidebar rather than inside any one page's
// scrolling content: sticky positioning needs nothing padded or scrolling
// between it and the real viewport to pin for an entire scroll range.
//
// Always mounted, and opened and closed by width, the same way the app
// sidebar is — so it slides rather than popping in. The rows keep a fixed
// width inside, so they're revealed by the slide instead of re-wrapping as
// the panel grows.
export function ClientSwitcher({
  clients,
  current,
  onDashboard,
  shown,
}: {
  clients: SwitcherClient[];
  // the open client's address
  current: string | null;
  onDashboard: boolean;
  shown: boolean;
}) {
  return (
    <aside
      aria-hidden={!shown}
      // not focusable or clickable while it's slid shut
      inert={!shown}
      // The same build as the app's rail beside it — same background, same
      // p-3, same h-9 rounded rows — so the two read as one sidebar in two
      // parts rather than a second, differently-made panel bolted on.
      className={`sticky top-0 hidden h-screen shrink-0 overflow-hidden bg-background transition-[width,opacity] duration-200 ease-in-out lg:block ${
        shown ? "w-52 border-r border-border opacity-100" : "w-0 opacity-0"
      }`}
    >
      <div className="flex h-full w-52 flex-col gap-1 overflow-y-auto p-3">
        {/* level with the rail's logo row, so "All clients" lines up with
            the Clients icon it opened from */}
        <div className="mb-2 flex h-9 shrink-0 items-center justify-between pl-2">
          <span className="text-sm font-semibold">Clients</span>
          <button
            type="button"
            onClick={toggleClientsPanel}
            title="Hide clients"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <Row href="/clients" active={onDashboard}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <LayoutGrid size={15} />
          </span>
          <span className="truncate">All clients</span>
        </Row>
        <p className="mt-3 mb-1 flex items-center justify-between px-2 text-xs text-muted">
          Current <span className="tabular-nums">{clients.length}</span>
        </p>
        {clients.map((c) => (
          <Row key={c.id} href={clientHref(c)} active={current === c.slug}>
            {c.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={c.logo} alt="" className="photo h-6 w-6" />
            ) : (
              <Avatar name={c.name} size={24} />
            )}
            <span className="truncate">{c.name}</span>
          </Row>
        ))}
      </div>
    </aside>
  );
}

// h-9: every row the same fixed height whatever's in it — a truncated name
// or an uploaded logo used to render rows very slightly different heights,
// which made the hover and selected rectangles look different sizes.
// Rounded and inset, exactly like the rail's own rows next to it.
function Row({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150 ${
        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2/60 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
