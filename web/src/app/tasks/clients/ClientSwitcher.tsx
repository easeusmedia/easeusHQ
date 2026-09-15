import Link from "next/link";
import { Avatar } from "../TaskCard";

export type SwitcherClient = { id: string; name: string; avatarUrl: string | null };

// The roster down the left of a client's own page — jump straight to
// another client instead of backing out to the full Clients dashboard just
// to open a different one. Lives in the shared /tasks layout (see
// ClientSwitcherSlot), as a true sibling of the app's own sidebar rather
// than inside any one page's scrolling content — sticky positioning needs
// nothing padded/scrolling between it and the real viewport to reliably
// pin for an entire scroll range, and a plain top-0 (no offset math, no
// height padding to compensate for one) is what that buys: this used to
// need both, tuned against the page's own edge padding, and still let go
// right at the bottom of a short client's page once that tuning ran out of
// room to work with.
export function ClientSwitcher({ clients, currentId }: { clients: SwitcherClient[]; currentId: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-48 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/40 py-3 lg:flex">
      {clients.map((c) => {
        const active = c.id === currentId;
        return (
          <Link
            key={c.id}
            href={`/tasks/clients/${c.id}`}
            // h-9: every row the same fixed height regardless of what's in
            // it — a truncated two-word name or a real uploaded logo (vs.
            // the plain initials circle) rendered rows at very slightly
            // different heights before, which showed up as the hover/
            // active rectangle looking a different size client to client.
            //
            // Every row spans the panel edge to edge — the horizontal
            // padding lives on the row (px-5) rather than on the panel, so a
            // highlight fills the full width instead of floating inside a
            // 12px margin with unhovered strips down both sides. That held
            // for the selected row already; hover was still inset, which is
            // what left the gaps.
            //
            // Full-width bars are square, not rounded: a rounded rectangle
            // touching both edges reads as a mistake, and stacked rounded
            // rows visually merge into each other.
            className={`flex h-9 shrink-0 items-center gap-2 px-5 text-sm ${
              active
                ? // -mr-px so its background paints over the panel's own
                  // right border and the open client reads as fused onto
                  // the content pane beside it
                  "-mr-px bg-surface-2 text-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={c.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <Avatar name={c.name} size={24} />
            )}
            <span className="truncate">{c.name}</span>
          </Link>
        );
      })}
    </aside>
  );
}
