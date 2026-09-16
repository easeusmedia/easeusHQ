import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Avatar } from "../TaskCard";
import { clientHref } from "@/lib/slug";

export type SwitcherClient = { id: string; slug: string | null; name: string; avatarUrl: string | null };

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
  // the open client's address (or id, from an old link)
  current: string | null;
  onDashboard: boolean;
  shown: boolean;
}) {
  return (
    <aside
      aria-hidden={!shown}
      // not focusable or clickable while it's slid shut
      inert={!shown}
      className={`sticky top-0 hidden h-screen shrink-0 overflow-hidden bg-surface/40 transition-[width,opacity] duration-200 ease-in-out lg:block ${
        shown ? "w-48 border-r border-border opacity-100" : "w-0 opacity-0"
      }`}
    >
      <div className="flex h-full w-48 flex-col overflow-y-auto py-3">
        <Row href="/clients" active={onDashboard}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <LayoutGrid size={16} />
          </span>
          <span className="truncate">All clients</span>
        </Row>
        <div className="mx-5 my-2 border-t border-border" />
        {clients.map((c) => (
          <Row key={c.id} href={clientHref(c)} active={current === c.slug || current === c.id}>
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={c.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
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
//
// Full width, edge to edge: the padding lives on the row (px-5), not the
// panel, so a highlight fills the panel instead of floating inside a margin
// with unhovered strips down both sides. Square, not rounded — rounded rows
// touching both edges read as a mistake and merge into each other.
function Row({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex h-9 shrink-0 items-center gap-2 px-5 text-sm ${
        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
