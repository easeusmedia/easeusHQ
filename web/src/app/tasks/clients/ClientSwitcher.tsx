import Link from "next/link";
import { Avatar } from "../TaskCard";

export type SwitcherClient = { id: string; name: string; avatarUrl: string | null };

// The roster down the left of a client's own page — jump straight to
// another client instead of backing out to the full Clients dashboard
// just to open a different one.
export function ClientSwitcher({ clients, currentId }: { clients: SwitcherClient[]; currentId: string }) {
  return (
    // sticky + h-screen: the page content this sits beside scrolls inside
    // its own container (the layout's overflow-y-auto wrapper), and this
    // was a plain flow child of that same container — so it scrolled away
    // with the content instead of staying put like the app's own sidebar
    // does. Same fix as that sidebar: pin it to the viewport and let its
    // own overflow-y-auto handle a roster too long to fit.
    // The parent row already cancels the shared layout's own padding for
    // this whole row (see [id]/page.tsx), which is what gets this flush
    // against the app sidebar — but that cancellation doesn't reach a
    // *sticky* descendant's own stuck-position math: a sticky element's
    // threshold is measured from the nearest scrolling ancestor's real
    // padding edge no matter what an in-between negative margin does
    // visually, so without this it sits stuck 25.9px/2rem too low the
    // instant scrolling engages it. -top-6 (sm:-top-8) cancels that
    // padding for the threshold itself; h-[calc...] grows the box back
    // out by the same amount so its bottom still reaches the viewport
    // edge instead of falling short by it.
    <aside className="sticky -top-6 hidden h-[calc(100vh+2rem)] w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface/40 py-2 pl-6 pr-2 pt-6 sm:-top-8 sm:pl-8 sm:pt-8 lg:flex">
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
            className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-2 text-sm ${
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
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
