"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SquareKanban, History, ListChecks, MessagesSquare, UsersRound, Building2, CalendarDays, PanelLeft, LogOut, Camera, Plug, Trash2, ChartColumn, FileSignature } from "lucide-react";
import { Avatar } from "./TaskCard";
import { Dropdown } from "./Dropdown";
import { usePhoto } from "./photos";
import { updatePersonPhoto } from "./team/actions";
import { resizeToJpeg } from "@/lib/imageResize";
import { isActive } from "./sidebarActive";
import { CLIENTS_SECTION, useActiveClient } from "./clients/clientsPanel";
import { clientHref } from "@/lib/slug";

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
  { href: "/clients", label: "Clients", hint: "Every client and their projects", Icon: Building2 },
  // a kanban board, because that is literally what it is
  { href: "/board", label: "Board", hint: "Editing queue and the team's work", Icon: SquareKanban },
  // your own tasks only — the whole team's work is on the Board
  { href: "/my-tasks", label: "My tasks", hint: "Your own to-dos", Icon: ListChecks },
  { href: "/history", label: "History", hint: "Everything finished", Icon: History },
  // the team's own chat — a real page now, not the avatar stack that used
  // to float over the bottom-right corner of every other page
  { href: "/chat", label: "Chat", hint: "Message the team", Icon: MessagesSquare },
];

// the rows' own shape; `selected` (globals.css) is the dark gradient pill.
// Every row carries the same transparent 1px border the pill has, so the
// icon doesn't shift a pixel when its row becomes the selected one.
const ROW = "border border-transparent";
const IDLE = "text-muted hover:bg-white/[0.04] hover:text-foreground";

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

// Every current client, in a card at the foot of the rail — one click to any
// of them from anywhere, the one you're on lit. Collapsed, the same rows are
// just their logos in a column (the names fold away as the menu's do).
function ClientsCard({ clients, current, open }: { clients: SidebarClient[]; current: string | null; open: boolean }) {
  return (
    <div className="panel-soft mt-2 w-full shrink-0 rounded-2xl px-0.5 py-1">
      <p
        className={`flex items-center overflow-hidden whitespace-nowrap px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted/60 transition-[max-height,opacity,padding] duration-200 ease-in-out ${
          open ? "max-h-8 pb-1.5 pt-1.5 opacity-100" : "max-h-0 py-0 opacity-0"
        }`}
      >
        Clients
        <span className="ml-auto tabular-nums tracking-normal">{clients.length}</span>
      </p>
      {/* ponytail: collapsed, a name shows on hover as the browser's own
          title — the rail's quick tips can't escape this scrolling list */}
      <ul className="max-h-52 overflow-y-auto">
        {clients.map((c) => {
          const on = c.slug === current;
          return (
            <li key={c.id}>
              <Link
                href={clientHref(c)}
                onClick={(e) => e.stopPropagation()}
                title={open ? undefined : c.name}
                className={`flex h-8 w-full items-center rounded-[10px] px-1.5 text-[13px] transition-colors duration-150 ${ROW} ${open ? "gap-2" : "gap-0"} ${
                  on ? "selected" : IDLE
                }`}
              >
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
                  <img src={c.logo} alt="" className={`photo size-5 shrink-0 ${on ? "ring-1 ring-accent/60" : ""}`} />
                ) : (
                  <Avatar name={c.name} size={20} presence={false} />
                )}
                <FadeLabel open={open}>
                  <span className={on ? "font-medium" : ""}>{c.name}</span>
                </FadeLabel>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar({
  isOps = false,
  name,
  canViewAs,
  people,
  sessionUserId,
  unreadBySender,
  contractsWaiting = 0,
  clients = [],
  logout,
  initialOpen,
}: {
  isOps?: boolean;
  name: string;
  canViewAs: boolean;
  people: Person[];
  sessionUserId: string;
  unreadBySender: Record<string, number>;
  // contracts whose client has sent the form, waiting on ops
  contractsWaiting?: number;
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
  const searchParams = useSearchParams();
  // only "viewing as" follows you between pages — a page's own view state
  // (?scope=, ?tab=) means nothing anywhere else
  const as = searchParams.get("as");
  const qs = as ? `as=${encodeURIComponent(as)}` : "";
  // click-only — no hover peek. Opens/closes only via the toggle button.
  const [open, setOpen] = useState(initialOpen);
  const [profileOpen, setProfileOpen] = useState(false);
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
      setPhotoState("Couldn't read that picture.");
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

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // a cookie, not localStorage — the server needs to read this on the
      // very next request to render the right state from the start
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  const current = searchParams.get("as") ?? sessionUserId;

  // the client you're on: its own page names it; a project's page says
  const activeClient = useActiveClient();
  const currentClient = pathname.match(CLIENTS_SECTION)?.[1] ?? (pathname.startsWith("/projects/") ? activeClient : null);

  const groups = [
    { label: "Main", items: MAIN },
    {
      label: "Manage",
      items: isOps
        ? [
            { href: "/calendar", label: "Calendar", hint: "Workload day by day", Icon: CalendarDays },
            // every client's YouTube and Instagram views in one place
            { href: "/analytics", label: "Analytics", hint: "Views across every client", Icon: ChartColumn },
            // client contracts, from the form to the signed copy
            { href: "/contracts", label: "Contracts", hint: "Client agreements and e-signing", Icon: FileSignature, count: contractsWaiting },
            // core members see their own team here (read-only); admin edits everyone
            { href: "/team", label: "Team", hint: "Everyone and their roles", Icon: UsersRound },
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
        open ? "w-64" : "w-[72px]"
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
          className={`group/tip relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${open ? "" : "group hover:bg-white/[0.05]"}`}
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
        const active = isActive(item.href, pathname);
        // what's waiting behind this item: unread chat, contracts to finish
        const count = item.href === "/chat" ? unreadCount : "count" in item ? (item.count ?? 0) : 0;
        const waiting = item.href === "/chat" ? `${unreadCount} unread` : `${count} waiting on you`;
        return (
          <Link
            key={item.href}
            href={qs ? `${item.href}?${qs}` : item.href}
            onClick={(e) => e.stopPropagation()} // don't also open the rail — this click already has its own job
            // w-full only while open — collapsed, this row sizes to its
            // 36px icon slot. gap-2/gap-0 are two real values of the same
            // property, so the gap animates with the label (see the shared
            // `a, button` transition rule in globals.css)
            className={`group/tip relative flex items-center rounded-xl text-sm transition-colors duration-150 ${ROW} ${open ? "w-full gap-2" : "gap-0"} ${
              active ? "selected" : IDLE
            }`}
          >
            {/* fixed-size slot, same position whether collapsed or open */}
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <item.Icon size={18} className={active ? "icon-glow" : ""} />
              {/* unread count rides the Chat icon itself, so it's visible
                  collapsed (where there's no label to put it beside) too */}
              {count > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-[#15181c]" />}
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
              show={!open}
              label={item.label}
              hint={count > 0 ? waiting : item.hint}
            />
          </Link>
        );
          })}
        </div>
      ))}
      </div>

      {clients.length > 0 && <ClientsCard clients={clients} current={currentClient} open={open} />}

      {/* Team moved out to a floating trigger below (see after </nav>) —
          pinned to the viewport, not this rail, per feedback. Just the
          profile row pinned at the bottom now. */}
      <div className="flex w-full flex-col items-start gap-3 pt-2">
        <div ref={profileRef} className="relative w-full">
        {profileOpen && (
          <div
            onClick={(e) => e.stopPropagation()} // includes the nested Viewing-as dropdown — none of this should reach the rail's own click-to-open handler
            className="pop-in panel absolute bottom-full left-0 mb-1 w-56 rounded-2xl p-1"
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
            >
              <Camera size={15} />
              {hasPhoto ? "Change photo" : "Add a photo"}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
              >
                <Trash2 size={15} />
                Remove photo
              </button>
            )}
            {photoState && <p className="px-2 py-1 text-xs text-muted">{photoState}</p>}
            {/* admin-only: what the app is joined up to outside itself */}
            {canViewAs && (
              <Link
                href="/integrations"
                onClick={() => setProfileOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
              >
                <Plug size={15} />
                Integrations
              </Link>
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
          className={`group/tip relative flex items-center rounded-xl text-left hover:bg-white/[0.04] ${open ? "w-full gap-2" : "gap-0"}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Avatar name={name} size={26} presence={false} />
          </span>
          <FadeLabel open={open}>
            <span className="text-sm">{name}</span>
          </FadeLabel>
          <Tip show={!open && !profileOpen} label={name} hint="Photo, account and log out" />
        </button>
        </div>
      </div>
      </div>
    </nav>

    </>
  );
}
