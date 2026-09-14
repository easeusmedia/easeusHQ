"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, History, ListTodo, Users, Users2, CalendarCheck2, PanelLeft, LogOut } from "lucide-react";
import { Avatar } from "./TaskCard";
import { Dropdown } from "./Dropdown";
import { TeamPanel } from "./team/TeamPanel";

const NAV = [
  { segment: "", label: "Board", Icon: LayoutDashboard },
  // everyone's own — editors and ops alike, unlike Clients/Calendar/Users
  // below which stay ops-only
  { segment: "/my", label: "My Tasks", Icon: ListTodo },
  { segment: "/history", label: "History", Icon: History },
];

const COOKIE_NAME = "tasks-sidebar-open";

type Person = { id: string; name: string; role: string; avatarUrl: string | null; lastSeenAt: Date | null };

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
  isAdmin = false,
  isOps = false,
  name,
  canViewAs,
  people,
  sessionUserId,
  unreadBySender,
  logout,
  initialOpen,
}: {
  isAdmin?: boolean;
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
  const qs = searchParams.toString();
  // click-only — no hover peek. Opens/closes only via the toggle button.
  const [open, setOpen] = useState(initialOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const unreadCount = Object.values(unreadBySender).reduce((a, b) => a + b, 0);
  // a couple of faces on the trigger itself — this opens the team roster,
  // not a chat inbox, so it should look like one at a glance
  const teamPreview = people.filter((p) => p.id !== sessionUserId).slice(0, 2);

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
      className={`sticky top-0 flex h-screen shrink-0 flex-col items-start gap-1 border-r border-border bg-background p-3 transition-[width] duration-200 ease-in-out ${
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
          title={open ? undefined : "Open sidebar"}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${open ? "" : "group hover:bg-surface-2"}`}
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
        ...NAV,
        ...(isOps ? [{ segment: "/clients", label: "Clients", Icon: Users2 }] : []),
        ...(isOps ? [{ segment: "/calendar", label: "Calendar", Icon: CalendarCheck2 }] : []),
        ...(isAdmin ? [{ segment: "/users", label: "Users", Icon: Users }] : []),
      ].map((item) => {
        const href = `${base}${item.segment}`;
        const active = pathname === href;
        return (
          <Link
            key={item.segment}
            href={qs ? `${href}?${qs}` : href}
            title={open ? undefined : item.label}
            onClick={(e) => e.stopPropagation()} // don't also open the rail — this click already has its own job
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
            className={`flex items-center rounded-md text-sm ${open ? "w-full gap-2" : "gap-0"} ${
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2"
            }`}
          >
            {/* fixed-size slot, same position whether collapsed or open */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center">
              <item.Icon size={18} />
            </span>
            <FadeLabel open={open}>{item.label}</FadeLabel>
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
                <p className="mb-1 text-[11px] font-medium text-muted">Viewing as</p>
                <Dropdown
                  key={current}
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
          title={open ? undefined : name}
          // same fixed layout (and the same animated gap-2/gap-0 — see
          // the nav rows' own comment above) as the nav rows: the avatar
          // never moves, and now neither does the name label mid-collapse
          className={`flex items-center rounded-md text-left hover:bg-surface-2 ${open ? "w-full gap-2" : "gap-0"}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Avatar name={name} size={26} />
          </span>
          <FadeLabel open={open}>
            <span className="text-sm">{name}</span>
          </FadeLabel>
        </button>
        </div>
      </div>
    </nav>

    {/* Floating, fixed to the viewport rather than this rail — "on top of
        everything" per feedback, above the Team panel's own backdrop
        (z-50) too so it stays reachable while the panel is open. Shifts
        left when the panel opens so it sits adjacent to it instead of
        disappearing behind it (22rem panel width + 1rem gap = 23rem). */}
    <div
      className={`fixed bottom-4 z-[60] flex items-center gap-2 transition-[right] duration-300 ease-out ${
        teamOpen ? "right-[23rem]" : "right-4"
      }`}
    >
      {/* the notification, adjacent to the icons on their left — not
          overlapping them — per feedback */}
      {unreadCount > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white ring-2 ring-background">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
      <button
        onClick={() => setTeamOpen(true)}
        title="Team"
        className="flex shrink-0 items-center rounded-full hover:brightness-110"
      >
        {/* stacked vertically, each face the same size as the profile
            avatar (26px) — was 16px and read as too small, per feedback */}
        <span className="flex flex-col -space-y-3">
          {teamPreview.map((p) =>
            p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img key={p.id} src={p.avatarUrl} alt="" className="h-[26px] w-[26px] rounded-full object-cover ring-2 ring-background" />
            ) : (
              <span key={p.id} className="ring-2 ring-background rounded-full">
                <Avatar name={p.name} size={26} />
              </span>
            )
          )}
        </span>
      </button>
    </div>

    {teamOpen && (
      <TeamPanel
        people={people}
        meId={sessionUserId}
        unreadBySender={unreadBySender}
        onClose={() => setTeamOpen(false)}
      />
    )}
    </>
  );
}
