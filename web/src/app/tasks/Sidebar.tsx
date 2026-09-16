"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SquareKanban, History, ListChecks, MessagesSquare, UsersRound, Building2, CalendarDays, PanelLeft, LogOut } from "lucide-react";
import { Avatar } from "./TaskCard";
import { Dropdown } from "./Dropdown";
import { isActive } from "./sidebarActive";
import { toggleClientsPanel } from "./clients/clientsPanel";

// Chosen for what each destination actually is, not just for variety. The
// two that mattered most: Clients and People were Users2 and Users — near
// identical glyphs for "companies we work for" and "people who work here",
// which is the one pair you never want ambiguous. They're a building and a
// group of people now.
const NAV = [
  // a kanban board, because that is literally what it is
  { segment: "", label: "Board", hint: "Editing queue and the team's work", Icon: SquareKanban },
  // everyone's own — editors and ops alike, unlike Clients/Calendar/Users
  // below which stay ops-only
  // your own tasks only — the whole team's work is the Board's Organization tab
  { segment: "/my", label: "My tasks", hint: "Your own to-dos", Icon: ListChecks },
  { segment: "/history", label: "History", hint: "Delivered work", Icon: History },
  // the team's own chat — a real page now, not the avatar stack that used
  // to float over the bottom-right corner of every other page
  { segment: "/chat", label: "Chat", hint: "Message the team", Icon: MessagesSquare },
];

const COOKIE_NAME = "tasks-sidebar-open";

type Person = { id: string; name: string; role: string; avatarUrl: string | null; lastSeenAt: Date | null };

// Collapsed, the rail is icons only; this names each one the moment the
// pointer is on it. The browser's own title tooltip did the job in theory,
// but it takes a second or more to appear, so in practice nobody saw it.
// Hidden from screen readers — the row's own (faded) label already names it.
function Tip({ show, label, hint }: { show: boolean; label: string; hint?: string }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 ml-5 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left opacity-0 shadow-lg transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
    >
      <span className="block text-xs font-medium text-foreground">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
  );
}

// always mounted, never conditionally rendered — fading opacity/max-width
// in sync with the nav's own width transition is what makes open/collapse
// look like one continuous motion instead of the label just popping away
// mid-animation
function FadeLabel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out ${
        open ? "max-w-[140px] opacity-100" : "max-w-0 opacity-0"
      }`}
    >
      {children}
    </span>
  );
}

export function Sidebar({
  isOps = false,
  name,
  canViewAs,
  people,
  sessionUserId,
  unreadBySender,
  logout,
  initialOpen,
}: {
  isOps?: boolean;
  name: string;
  canViewAs: boolean;
  people: Person[];
  sessionUserId: string;
  unreadBySender: Record<string, number>;
  logout: () => Promise<void>;
  // read server-side from a cookie (see layout.tsx) — the very first paint
  // already matches the saved preference, so there's nothing to correct
  // after mount and nothing to flicker
  initialOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // only "viewing as" follows you between pages — a page's own view state
  // (?scope=, ?tab=) means nothing anywhere else
  const as = searchParams.get("as");
  const qs = as ? `as=${encodeURIComponent(as)}` : "";
  // click-only — no hover peek. Opens/closes only via the toggle button.
  const [open, setOpen] = useState(initialOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const unreadCount = Object.values(unreadBySender).reduce((a, b) => a + b, 0);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // a cookie, not localStorage — the server needs to read this on the
      // very next request to render the right state from the start
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // works for both /tasks and the temporary /tasks/preview demo route
  const base = pathname.startsWith("/tasks/preview") ? "/tasks/preview" : "/tasks";
  const current = searchParams.get("as") ?? sessionUserId;

  return (
    <>
    {/* sticky, not just a flex sibling — stays put if anything ever makes the
        page itself taller than the viewport, instead of scrolling away */}
    <nav
      // collapsed: clicking anywhere on the rail opens it, not just the
      // logo — the button below stops its own click from bubbling here so
      // it doesn't get toggled twice
      onClick={() => !open && toggle()}
      // items-start: a flex column's children default to *stretching* to
      // the container's full cross-axis width. Every row below has its own
      // explicit w-full while open, so this didn't matter then — but while
      // collapsed, nothing set a width, so each row silently stretched to
      // the rail's own inner width (~35px) anyway. The icon slot inside is
      // a fixed 36px box, left-aligned in that wider row, so the leftover
      // few px of stretched width landed entirely on the right of the
      // icon — the actual source of the icons reading as off-center; not
      // the icon glyphs themselves, which were already centered in their
      // own slot the whole time.
      // z-30: sticky makes this its own stacking context, so without a
      // z-index the clients panel (also sticky, and later in the page)
      // would paint over the hover labels that stick out past this rail
      className={`sticky top-0 z-30 flex h-screen shrink-0 flex-col items-start gap-1 border-r border-border bg-background p-3 transition-[width] duration-200 ease-in-out ${
        open ? "w-52" : "w-16"
      }`}
    >
      {/* The logo button is always mounted at the same fixed position —
          never swapped for a different element — which is what actually
          fixed the earlier "logo jumps on collapse" bug: open and
          collapsed used to be two completely different DOM subtrees, so
          React unmounted one and mounted the other on every click, and the
          incoming one measured its centering against whatever width the
          nav happened to be at that instant. The dedicated close button
          uses the exact same trick as a fading nav label (max-width +
          opacity, never conditionally rendered) instead of being swapped
          in/out, so re-adding it here can't reintroduce that jump. */}
      {/* w-full: nav no longer stretches its children by default (see the
          items-start comment above), and this row's ml-auto close button
          needs real width to push against */}
      <div className="mb-2 flex h-9 w-full items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation(); // the rail itself also opens on click — don't double-toggle
            toggle();
          }}
          // hover-crossfade only matters (and only shows a tooltip) while
          // collapsed — that's the ONLY control at 64px. Once the dedicated
          // button to the right exists, the logo goes back to being a
          // plain, non-interactive-looking logo — two things swapping to
          // the same "close sidebar" icon on hover was the actual complaint
          aria-label={open ? undefined : "Open sidebar"}
          className={`group/tip relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${open ? "" : "group hover:bg-surface-2"}`}
        >
          <Image
            src="/logo.png"
            alt="Easeus"
            width={21}
            height={21}
            className={`h-[21px] w-[21px] object-contain transition-opacity duration-150 ${open ? "" : "group-hover:opacity-0"}`}
            priority
          />
          {!open && (
            <PanelLeft size={18} className="absolute text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          )}
          <Tip show={!open} label="Open sidebar" />
        </button>
        <FadeLabel open={open}>
          <span className="text-sm font-semibold">Easeus HQ</span>
        </FadeLabel>
        {/* dedicated close button, adjacent to the logo — fades away (not
            unmounts) once collapsed, same as a nav label does. Same h-9/18
            sizing as every other icon on the rail — this was rendering
            visibly smaller (h-8, size 16) before. */}
        <span
          className={`ml-auto overflow-hidden transition-[max-width,opacity] duration-200 ease-in-out ${
            open ? "max-w-9 opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            title="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2"
          >
            <PanelLeft size={18} />
          </button>
        </span>
      </div>

      {[
        // clients first: everyone sees them — what the agency is working on
        // isn't privileged information inside the agency
        { segment: "/clients", label: "Clients", hint: "Every client and their projects", Icon: Building2 },
        ...NAV,
        ...(isOps ? [{ segment: "/calendar", label: "Calendar", hint: "Workload day by day", Icon: CalendarDays }] : []),
        // core members see their own team here (read-only); admin edits everyone
        ...(isOps ? [{ segment: "/users", label: "People", hint: "The team and their roles", Icon: UsersRound }] : []),
      ].map((item) => {
        const href = `${base}${item.segment}`;
        const active = isActive(item.segment, pathname, base);
        return (
          <Link
            key={item.segment}
            href={qs ? `${href}?${qs}` : href}
            onClick={(e) => {
              e.stopPropagation(); // don't also open the rail — this click already has its own job
              // On a client's own page the Clients icon is what put the
              // roster panel on screen, so it's also what should take it
              // away: toggle it instead of navigating to a list you're
              // already effectively looking at. Anywhere else it stays a
              // plain link.
              if (item.segment === "/clients" && /^\/tasks\/clients\/[^/]+$/.test(pathname)) {
                e.preventDefault();
                toggleClientsPanel();
              }
            }}
            // w-full only while open — collapsed, this row has no width
            // class at all, so it sizes to exactly its own content (the
            // 36px icon slot; the label is 0-width) now that nav itself no
            // longer stretches it wider than that (see nav's items-start
            // above). gap-2/gap-0 (not gap-2/no-gap-class) are two real
            // *values* of the same property, which the browser can animate
            // — a class that's simply absent isn't a value, so the gap
            // used to just vanish the instant the row collapsed, while the
            // label next to it was still shrinking over the next 200ms.
            // The label visibly snapping left onto the icon and then
            // fading, instead of shrinking away in one motion, was that
            // mismatch. The transition that actually animates it lives in
            // globals.css's shared `a, button` rule, not a utility class
            // here — see that rule's own comment for why a Tailwind
            // transition utility on gap silently never worked.
            className={`group/tip relative flex items-center rounded-md text-sm ${open ? "w-full gap-2" : "gap-0"} ${
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2"
            }`}
          >
            {/* fixed-size slot, same position whether collapsed or open */}
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <item.Icon size={18} />
              {/* unread count rides the Chat icon itself, so it's visible
                  collapsed (where there's no label to put it beside) too */}
              {item.segment === "/chat" && unreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
              )}
            </span>
            <FadeLabel open={open}>{item.label}</FadeLabel>
            {item.segment === "/chat" && unreadCount > 0 && open && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            <Tip
              show={!open}
              label={item.label}
              hint={item.segment === "/chat" && unreadCount > 0 ? `${unreadCount} unread` : item.hint}
            />
          </Link>
        );
      })}

      {/* Team moved out to a floating trigger below (see after </nav>) —
          pinned to the viewport, not this rail, per feedback. Just the
          profile row pinned at the bottom now. */}
      <div className="mt-auto flex w-full flex-col items-start gap-3">
        <div ref={profileRef} className="relative w-full">
        {profileOpen && (
          <div
            onClick={(e) => e.stopPropagation()} // includes the nested Viewing-as dropdown — none of this should reach the rail's own click-to-open handler
            className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-surface-2 p-1 shadow-xl"
          >
            {canViewAs && (
              <div className="px-2 py-1.5">
                <p className="mb-1 text-xs font-medium text-muted">Viewing as</p>
                <Dropdown
                  key={current}
                  size="sm"
                  defaultValue={current}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(id) => {
                    const params = new URLSearchParams(searchParams);
                    params.set("as", id);
                    router.push(`${pathname}?${params.toString()}`);
                  }}
                />
              </div>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
              >
                <LogOut size={15} />
                Log out
              </button>
            </form>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation(); // don't also open the rail — this click already has its own job
            setProfileOpen((v) => !v);
          }}
          // same fixed layout (and the same animated gap-2/gap-0 — see
          // the nav rows' own comment above) as the nav rows: the avatar
          // never moves, and now neither does the name label mid-collapse
          className={`group/tip relative flex items-center rounded-md text-left hover:bg-surface-2 ${open ? "w-full gap-2" : "gap-0"}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Avatar name={name} size={26} />
          </span>
          <FadeLabel open={open}>
            <span className="text-sm">{name}</span>
          </FadeLabel>
          <Tip show={!open && !profileOpen} label={name} hint="Account and log out" />
        </button>
        </div>
      </div>
    </nav>

    </>
  );
}
