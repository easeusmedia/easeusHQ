import Link from "next/link";
import { Avatar } from "../TaskCard";

export type SwitcherClient = { id: string; name: string; avatarUrl: string | null };

// The roster down the left of a client's own page — jump straight to
// another client instead of backing out to the full Clients dashboard
// just to open a different one.
export function ClientSwitcher({ clients, currentId }: { clients: SwitcherClient[]; currentId: string }) {
  return (
    // self-stretch: the flex row this sits in only stretches its children
    // by default when nothing else says otherwise, and it's easy for that
    // to quietly stop being true — pin it explicitly so the border/tint
    // below always run the full height of the row next to it, not just
    // this list's own (usually shorter) content height.
    // -ml-6/-mt-6 cancel the page's own edge padding on this side and top
    // (sm:-ml-8/-mt-8 to match at the wider breakpoint) — the switcher
    // reads as a second sidebar, so it should sit flush against the real
    // one instead of floating a whole padding's-width away from it. pl/pt
    // re-add just enough of that same padding as internal breathing room.
    <aside className="hidden -ml-6 -mt-6 w-48 shrink-0 flex-col gap-0.5 self-stretch overflow-y-auto border-r border-border bg-surface/40 py-2 pl-6 pr-2 pt-6 sm:-ml-8 sm:-mt-8 sm:pl-8 sm:pt-8 lg:flex">
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
