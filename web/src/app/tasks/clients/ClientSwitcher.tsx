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
    <aside className="sticky top-0 hidden h-screen w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface/40 p-3 lg:flex">
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
            // The active row bleeds out of the panel's padding on BOTH
            // sides: right by the padding plus the 1px border, so its own
            // background paints over that dividing line and the row reads as
            // fused onto the content pane; left by the padding alone, so it
            // reaches the panel's own edge. It used to bleed right only,
            // which left a 12px strip of panel showing down the left of the
            // selected row — the "slight gap at the left".
            //
            // pl-5 puts the padding back as padding (12px bled + 8px = the
            // same 20px from the panel edge every other row's content sits
            // at), so nothing shifts sideways when a row becomes active.
            className={`flex h-9 shrink-0 items-center gap-2 text-sm ${
              active
                ? "-ml-3 -mr-[calc(0.75rem+1px)] rounded-none bg-surface-2 pl-5 pr-2 text-foreground"
                : "rounded-md px-2 text-muted hover:bg-surface-2 hover:text-foreground"
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
