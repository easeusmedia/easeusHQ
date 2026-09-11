"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, History, Users, CalendarCheck2, PanelLeft, LogOut } from "lucide-react";
import { Avatar } from "./TaskCard";
import { Dropdown } from "./Dropdown";

const NAV = [
  { segment: "", label: "Board", Icon: LayoutDashboard },
  { segment: "/history", label: "History", Icon: History },
];

const COOKIE_NAME = "tasks-sidebar-open";

type Person = { id: string; name: string; role: string };

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
  logout,
  initialOpen,
}: {
  isAdmin?: boolean;
  isOps?: boolean;
  name: string;
  canViewAs: boolean;
  people: Person[];
  sessionUserId: string;
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
  const profileRef = useRef<HTMLDivElement>(null);

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
    // sticky, not just a flex sibling — stays put if anything ever makes the
    // page itself taller than the viewport, instead of scrolling away
    <nav
      // collapsed: clicking anywhere on the rail opens it, not just the
      // logo — the button below stops its own click from bubbling here so
      // it doesn't get toggled twice
      onClick={() => !open && toggle()}
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-1 border-r border-border bg-background p-3 transition-[width] duration-200 ease-in-out ${
        open ? "w-52" : "w-16"
      }`}
    >
      {/* ONE button, always mounted, never swapped for a different element —
          that was the actual cause of the logo "jumping": open and
          collapsed used to be two completely different DOM subtrees (a
          wide header row vs. a centered button), so React unmounted one
          and mounted the other on every click, and the incoming one
          measured its centering against whatever width the nav happened
          to be at that exact instant, producing a jump before the width
          transition even caught up. Same fixed-position/fading-label
          approach as the nav links below fixes it the same way — and
          folding the separate "dedicated toggle button" into this one
          control is also just what ChatGPT itself actually does (hover
          the logo, it swaps to the panel icon, click toggles). */}
      <div className="mb-2 flex h-9 items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation(); // the rail itself also opens on click — don't double-toggle
            toggle();
          }}
          title={open ? "Close sidebar" : "Open sidebar"}
          className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-surface-2"
        >
          <Image
            src="/logo.png"
            alt="Easeus"
            width={21}
            height={21}
            className="h-[21px] w-[21px] object-contain transition-opacity duration-150 group-hover:opacity-0"
            priority
          />
          <PanelLeft size={18} className="absolute text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </button>
        <FadeLabel open={open}>
          {/* text-xs, not text-sm — at the SAME pixel size, semibold
              optically reads bigger than the regular-weight nav labels
              next to it (heavier strokes fill more of the letterform);
              one size down is what actually looks size-matched */}
          <span className="text-xs font-semibold">Easeus HQ</span>
        </FadeLabel>
      </div>

      {[
        ...NAV,
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
            // always full width, always flex-start, always the same gap —
            // nothing about this row's own layout, or the icon's position
            // within it, ever changes with `open`. Only the label (below)
            // fades — the icon itself doesn't move a single pixel, so
            // there's nothing to jump and nothing for its padding to
            // visibly differ between the two states
            className={`flex items-center gap-2 rounded-md text-sm ${
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

      {/* profile — pinned at the very bottom, ChatGPT-style */}
      <div ref={profileRef} className="relative mt-auto">
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
          // same fixed layout as the nav links above — the avatar never moves
          className="flex w-full items-center gap-2 rounded-md text-left hover:bg-surface-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Avatar name={name} size={26} />
          </span>
          <FadeLabel open={open}>
            <span className="text-sm">{name}</span>
          </FadeLabel>
        </button>
      </div>
    </nav>
  );
}
