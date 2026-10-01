"use client";

import Image from "next/image";
import { PrefetchLink } from "./PrefetchLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Eye, House, SquareKanban, History, ListChecks, MessagesSquare, UsersRound, Building2, CalendarDays, PanelLeft, LogOut, Camera, Plug, Trash2, ChartColumn, FileSignature, ChevronDown, ChevronUp, Wallet, Gauge } from "lucide-react";
import { Avatar } from "./TaskCard";
import { usePhoto } from "./photos";
import { updatePersonPhoto } from "./team/actions";
import { viewAs } from "./viewAs";
import { Reveal } from "./Reveal";
import { resizeToJpeg } from "@/lib/imageResize";
import { isActive } from "./sidebarActive";
import { CLIENTS_SECTION, useActiveClient } from "./clients/clientsPanel";
import { clientHref } from "@/lib/slug";
import { readConsent } from "@/lib/consent";

// logo: the logo's own address (see clientLogoSrc), not the image itself
export type SidebarClient = { id: string; slug: string; name: string; logo: string | null };

// Chosen for what each destination actually is, not just for variety. The
// two that mattered most: Clients and People were Users2 and Users — near
// identical glyphs for "companies we work for" and "people who work here",
// which is the one pair you never want ambiguous. They're a building and a
// group of people now.
const MAIN = [
  // clients first: everyone sees them — what the agency is working on
  // isn't privileged information inside the agency
  { href: "/clients", label: "Clients", hint: "All clients and their projects", Icon: Building2 },
  // a kanban board, because that is literally what it is
  { href: "/board", label: "Board", hint: "Production's video and design queues", Icon: SquareKanban },
  // your own tasks only — the whole team's work is on the Board
  { href: "/my-tasks", label: "My tasks", hint: "Everything assigned to you", Icon: ListChecks },
  { href: "/history", label: "History", hint: "Completed work, all in one place", Icon: History },
  // the team's own chat — a real page now, not the avatar stack that used
  // to float over the bottom-right corner of every other page
  { href: "/chat", label: "Chat", hint: "Message your teammates", Icon: MessagesSquare },
];

// the rows' own shape; `selected` (globals.css) is the dark gradient pill.
// Every row carries the same transparent 1px border the pill has, so the
// icon doesn't shift a pixel when its row becomes the selected one.
const ROW = "border border-transparent";
const IDLE = "text-muted hover:bg-white/[0.04] hover:text-foreground";

const COOKIE_NAME = "tasks-sidebar-open";


// Collapsed, the rail is icons only; this names each one the moment the
// pointer is on it. The browser's own title tooltip did the job in theory,
// but it takes a second or more to appear, so in practice nobody saw it.
// Hidden from screen readers — the row's own (faded) label already names it.
function Tip({ show, label, hint }: { show: boolean; label: string; hint?: string }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 ml-5 -translate-x-1 -translate-y-1/2 whitespace-nowrap panel rounded-xl px-2.5 py-1.5 text-left opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/tip:translate-x-0 group-hover/tip:opacity-100 group-focus-visible/tip:translate-x-0 group-focus-visible/tip:opacity-100"
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

// The current clients under the Clients item, joined by a line that runs
// down from it and curves into each row; the one you're on is the selected
// pill, and the line to it is lit.
function ClientTree({ clients, current }: { clients: SidebarClient[]; current: string | null }) {
  const at = clients.findIndex((c) => c.slug === current);
  return (
    <ul>
      {clients.map((c, i) => {
        const on = i === at;
        return (
          <li key={c.id} className="relative pb-1">
            {/* the line down to this row, curving into it on the 32px row's centre line */}
            <span
              className={`absolute left-0 top-0 h-4 w-3 rounded-bl-lg border-b border-l transition-colors duration-300 ${
                at >= 0 && i <= at ? "border-accent/70" : "border-white/10"
              }`}
            />
            {i < clients.length - 1 && (
              <span className={`absolute bottom-0 left-0 top-4 w-px transition-colors duration-300 ${at > i ? "bg-accent/70" : "bg-white/10"}`} />
            )}
            <PrefetchLink
              href={clientHref(c)}
              onClick={(e) => e.stopPropagation()}
              className={`ml-4 flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-150 ${ROW} ${on ? "selected font-medium" : IDLE}`}
            >
              <ClientFace client={c} size={18} />
              <span className="truncate">{c.name}</span>
            </PrefetchLink>
          </li>
        );
      })}
    </ul>
  );
}

// a client's logo, or their initials when there's none
export function ClientFace({ client, size }: { client: SidebarClient; size: number }) {
  return client.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
    <img src={client.logo} alt="" className="photo shrink-0" style={{ width: size, height: size }} />
  ) : (
    <Avatar name={client.name} size={size} presence={false} />
  );
}

export function Sidebar({
  isOps = false,
  isFounder = false,
  seesBoard = true,
  viewAsPeople = null,
  canSeeFinance = false,
  name,
  fullAccess,
  isEditor = false,
  sessionUserId,
  unreadBySender,
  contractsWaiting = 0,
  noticesWaiting = 0,
  clients = [],
  logout,
  initialOpen,
}: {
  isOps?: boolean;
  // a Founder: Home, and Performance (grading is theirs)
  isFounder?: boolean;
  // whether the Board (Production's queues) is theirs to see
  seesBoard?: boolean;
  // everyone a Level 1 can view the app as (null for anyone else)
  viewAsPeople?: { id: string; name: string; level: string }[] | null;
  // admin only: what clients owe and what the team is paid
  canSeeFinance?: boolean;
  name: string;
  // admin and the developer: the Integrations page
  fullAccess: boolean;
  // an editor's work is the Board's editing queue: no My tasks
  isEditor?: boolean;
  sessionUserId: string;
  unreadBySender: Record<string, number>;
  // contracts whose client has sent the form, waiting on ops
  contractsWaiting?: number;
  // notices they haven't seen yet, on Home
  noticesWaiting?: number;
  // the current clients, under the Clients item
  clients?: SidebarClient[];
  logout: () => Promise<void>;
  // read server-side from a cookie (see layout.tsx) — the very first paint
  // already matches the saved preference, so there's nothing to correct
  // after mount and nothing to flicker
  initialOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // click-only — no hover peek. Opens/closes only via the toggle button.
  const [open, setOpen] = useState(initialOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoState, setPhotoState] = useState<string | null>(null);
  const hasPhoto = !!usePhoto(name);

  // your own photo, from the profile menu — open to everyone
  async function setPhoto(file: File | null) {
    setPhotoState("Saving…");
    try {
      const res = await updatePersonPhoto(sessionUserId, file ? await resizeToJpeg(file, 160, 160) : null);
      setPhotoState(res.error ?? null);
      if (!res.error) router.refresh();
    } catch {
      setPhotoState("That image couldn't be read. Please try a JPEG or PNG.");
    }
  }
  const profileRef = useRef<HTMLDivElement>(null);
  const unreadCount = Object.values(unreadBySender).reduce((a, b) => a + b, 0);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // A phone has no room for the open sidebar beside the page: there it
  // starts folded and folds again after each page is picked (nothing saved,
  // so a desktop keeps its own preference).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the screen's width is only known in the browser
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, [pathname]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // a cookie, not localStorage — the server needs to read this on the
      // very next request to render the right state from the start
      // a preference cookie: kept only if they accepted all cookies
      if (readConsent() === "all") document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // the client you're on: its own page names it; a project's page says
  const activeClient = useActiveClient();
  const currentClient = pathname.match(CLIENTS_SECTION)?.[1] ?? (pathname.startsWith("/projects/") ? activeClient : null);

  // The Clients item unfolds its clients — by itself whenever you're in
  // the clients area, and by its chevron any time
  const inClients = CLIENTS_SECTION.test(pathname);
  const [clientsOpen, setClientsOpen] = useState(inClients);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (inClients) setClientsOpen(true);
  }

  const groups = [
    // an editor sees their own numbers, read-only (the page takes them there)
    {
      label: "Main",
      // everyone's Home first: what they may see, at a glance
      items: [
        { href: "/home", label: "Home", hint: "Your work and notices, at a glance", Icon: House, count: noticesWaiting },
        ...(isEditor
          ? [...MAIN.filter((i) => i.href !== "/my-tasks"), { href: "/performance", label: "My performance", hint: "Your grade, feedback and what to work on", Icon: Gauge }]
          : MAIN.filter((i) => seesBoard || i.href !== "/board")),
      ],
    },
    {
      label: "Manage",
      items: isOps
        ? [
            { href: "/calendar", label: "Calendar", hint: "The team's workload, day by day", Icon: CalendarDays },
            // every client's YouTube and Instagram views in one place
            { href: "/analytics", label: "Analytics", hint: "Performance across every client", Icon: ChartColumn },
          ]
        : [],
    },
    // Running the company rather than the work: people, how they're doing,
    // money, and client agreements
    {
      label: "Admin",
      items: isOps
        ? [
            // core members see their own team here (read-only); admin edits everyone
            { href: "/team", label: "Employees", hint: "Everyone's record and current work", Icon: UsersRound },
            // how each editor and designer is doing: a Founder's to grade
            ...(isFounder ? [{ href: "/performance", label: "Performance", hint: "Grades, feedback and issues", Icon: Gauge }] : []),
            ...(canSeeFinance ? [{ href: "/finance", label: "Finance", hint: "Client payments and team pay", Icon: Wallet }] : []),
            // client contracts, from the form to the signed copy
            { href: "/contracts", label: "Contracts", hint: "Client agreements and e-signatures", Icon: FileSignature, count: contractsWaiting },
          ]
        : [],
    },
  ];

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
      // floats: a stroked panel inset from the window's edges, the page's
      // own background showing round it (after the Hynex reference)
      className={`sticky top-0 z-30 h-screen shrink-0 py-3 pl-3 transition-[width] duration-200 ease-in-out ${
        // collapsed: exactly one row wide inside the panel (its padding
        // and stroke, the row's 36-unit slot and 1px border each side), so
        // every icon sits dead centre. In spacing units rather than px —
        // the root font size is 87.5%, so a unit isn't the usual 4px
        open ? "w-64" : "w-[calc(var(--spacing)*17+4px)]"
      }`}
    >
      <div className="panel flex h-full flex-col items-start gap-1 rounded-3xl p-2.5">
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
          className={`group/tip relative ml-px flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${open ? "" : "group hover:bg-white/[0.05]"}`}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white/[0.05]"
          >
            <PanelLeft size={18} />
          </button>
        </span>
      </div>

      <div className={`flex min-h-0 w-full flex-1 flex-col items-start gap-1 ${open ? "overflow-y-auto" : ""}`}>
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.label} className="flex w-full flex-col items-start gap-1">
          {/* the group's name, folding away with the rail rather than
              leaving an empty line where it was */}
          <p
            className={`overflow-hidden whitespace-nowrap px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted/60 transition-[max-height,opacity,padding] duration-200 ease-in-out ${
              open ? "max-h-8 pb-1 pt-3 opacity-100" : "max-h-0 py-0 opacity-0"
            }`}
          >
            {g.label}
          </p>
          {g.items.map((item) => {
        // Clients is lit on the dashboard itself; on a client, the tree says which
        const isClients = item.href === "/clients";
        const active = isClients ? pathname === "/clients" : isActive(item.href, pathname);
        // what's waiting behind this item: unread chat, contracts to finish
        const count = item.href === "/chat" ? unreadCount : "count" in item ? (item.count ?? 0) : 0;
        const waiting = item.href === "/chat" ? `${unreadCount} unread` : item.href === "/home" ? `${count} new ${count === 1 ? "notice" : "notices"}` : `${count} waiting on you`;
        const row = (
          <PrefetchLink
            key={item.href}
            href={item.href}
            onClick={(e) => e.stopPropagation()} // don't also open the rail — this click already has its own job
            // w-full only while open — collapsed, this row sizes to its
            // 36px icon slot. gap-2/gap-0 are two real values of the same
            // property, so the gap animates with the label (see the shared
            // `a, button` transition rule in globals.css)
            className={`group/tip relative flex items-center rounded-xl text-sm transition-colors duration-150 ${ROW} ${open ? "w-full gap-2" : "gap-0"} ${
              active ? "selected" : IDLE
            } ${isClients && open ? "pr-8" : ""}`}
          >
            {/* fixed-size slot, same position whether collapsed or open */}
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <item.Icon size={18} className={active ? "icon-glow" : ""} />
              {/* unread count rides the Chat icon itself, so it's visible
                  collapsed (where there's no label to put it beside) too */}
              {count > 0 && !open && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-[#15181c]">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            <FadeLabel open={open}>{item.label}</FadeLabel>
            {count > 0 && open && (
              <span
                className="ml-auto mr-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/20 px-1 text-xs font-medium text-accent"
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
            <Tip
              show={!open && !isClients}
              label={item.label}
              hint={count > 0 ? waiting : item.hint}
            />
          </PrefetchLink>
          );
          if (!isClients) return row;
          return (
            <div key={item.href} className="group/fly relative w-full">
              {row}
              {/* open: a chevron unfolds the clients beneath */}
              {open && clients.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setClientsOpen((v) => !v);
                  }}
                  aria-label={clientsOpen ? "Hide clients" : "Show clients"}
                  aria-expanded={clientsOpen}
                  className="absolute right-1.5 top-2 flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <ChevronDown size={15} className={`transition-transform duration-200 ${clientsOpen ? "" : "-rotate-90"}`} />
                </button>
              )}
              {open && (
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${clientsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div className="ml-[18px] pb-1 pt-1">
                      <ClientTree clients={clients} current={currentClient} />
                    </div>
                  </div>
                </div>
              )}
              {/* collapsed: hovering the icon shows them in a card beside it */}
              {!open && clients.length > 0 && (
                <div className="pointer-events-none absolute left-full top-0 z-40 -translate-x-1 pl-4 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/fly:pointer-events-auto group-hover/fly:translate-x-0 group-hover/fly:opacity-100">
                  <div onClick={(e) => e.stopPropagation()} className="panel w-60 rounded-2xl p-2">
                    <PrefetchLink
                      href="/clients"
                      className="mb-1 flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-foreground hover:bg-white/[0.05]"
                    >
                      <Building2 size={15} /> All clients
                    </PrefetchLink>
                    <div className="ml-[13px]">
                      <ClientTree clients={clients} current={currentClient} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>
      ))}
      </div>

      {/* Team moved out to a floating trigger below (see after </nav>) —
          pinned to the viewport, not this rail, per feedback. Just the
          profile row pinned at the bottom now. */}
      <div className="flex w-full flex-col items-start gap-3 pt-2">
        <div ref={profileRef} className="relative w-full">
        {profileOpen && (
          <div
            onClick={(e) => e.stopPropagation()} // none of this should reach the rail's own click-to-open handler
            className="pop-in panel-accent absolute bottom-full left-0 mb-1 w-60 rounded-2xl p-1"
          >
            <p className="truncate px-2.5 pt-2 pb-2 text-sm font-medium">{name}</p>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // picking the same file again still counts
                if (file) setPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="menu-item px-2.5 py-2 text-sm"
            >
              <Camera size={15} />
              {hasPhoto ? "Change photo" : "Add a photo"}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="menu-item px-2.5 py-2 text-sm"
              >
                <Trash2 size={15} />
                Remove photo
              </button>
            )}
            {photoState && <p className="px-2 py-1 text-xs text-muted">{photoState}</p>}
            {/* Level 1: the app as someone else sees it */}
            {viewAsPeople && (
              <>
                <button type="button" aria-expanded={viewAsOpen} onClick={() => setViewAsOpen((v) => !v)} className="menu-item px-2.5 py-2 text-sm">
                  <Eye size={15} />
                  View as
                  <ChevronDown size={14} className={`ml-auto text-muted transition-transform duration-200 ${viewAsOpen ? "rotate-180" : ""}`} />
                </button>
                <Reveal open={viewAsOpen}>
                  <div className="mx-1 mb-1 max-h-56 overflow-y-auto rounded-xl bg-white/[0.03] p-1">
                    {viewAsPeople.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={async () => {
                          await viewAs(p.id);
                          router.replace("/");
                          router.refresh();
                        }}
                        className="menu-item justify-between px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted">{p.level}</span>
                      </button>
                    ))}
                  </div>
                </Reveal>
              </>
            )}
            {/* admin-only: what the app is joined up to outside itself */}
            {fullAccess && (
              <PrefetchLink
                href="/integrations"
                onClick={() => setProfileOpen(false)}
                className="menu-item px-2.5 py-2 text-sm"
              >
                <Plug size={15} />
                Integrations
              </PrefetchLink>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="menu-item px-2.5 py-2 text-sm"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </form>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation(); // don't also open the rail — this click already has its own job
            setProfileOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          // same fixed layout (and the same animated gap-2/gap-0 — see
          // the nav rows' own comment above) as the nav rows: the avatar
          // never moves, and now neither does the name label mid-collapse
          className={`group/tip hover-accent relative flex items-center rounded-xl text-left ${ROW} ${open ? "w-full gap-2" : "gap-0"}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Avatar name={name} size={26} presence={false} />
          </span>
          <FadeLabel open={open}>
            <span className="text-sm">{name}</span>
          </FadeLabel>
          {/* says there's a menu here: it opens upward, and the arrow turns
              as it does; fades with the name when the rail folds */}
          <span
            className={`ml-auto flex shrink-0 overflow-hidden text-muted transition-[max-width,margin,opacity] duration-200 ease-in-out group-hover/tip:text-foreground ${
              open ? "mr-2 max-w-5 opacity-100" : "mr-0 max-w-0 opacity-0"
            }`}
          >
            <ChevronUp size={15} className={`transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} />
          </span>
          <Tip show={!open && !profileOpen} label={name} hint="Your photo, account and sign-out" />
        </button>
        </div>
      </div>
      </div>
    </nav>

    </>
  );
}
