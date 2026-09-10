"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, History, Users, CalendarCheck2, PanelLeft, Check } from "lucide-react";

const NAV = [
  { segment: "", label: "Board", Icon: LayoutDashboard },
  { segment: "/history", label: "History", Icon: History },
];

type Mode = "expanded" | "collapsed" | "hover";
const STORAGE_KEY = "tasks-sidebar-mode";
const MODES: { value: Mode; label: string }[] = [
  { value: "expanded", label: "Expanded" },
  { value: "collapsed", label: "Collapsed" },
  { value: "hover", label: "Expand on hover" },
];

export function Sidebar({ isAdmin = false, isOps = false }: { isAdmin?: boolean; isOps?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const [mode, setMode] = useState<Mode>("expanded");
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // per-viewer UI preference only — read after mount to avoid a hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "expanded" || stored === "collapsed" || stored === "hover") setMode(stored);
    } catch {
      // ignore (private browsing, etc.)
    }
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(next: Mode) {
    setMode(next);
    setMenuOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  // works for both /tasks and the temporary /tasks/preview demo route
  const base = pathname.startsWith("/tasks/preview") ? "/tasks/preview" : "/tasks";
  const wide = mode === "expanded" || (mode === "hover" && hovered);
  // "hover" mode floats the expanded panel over the page instead of pushing
  // it — the reserved rail stays 64px in the layout regardless
  const overlay = mode === "hover";

  const nav = (
    <nav
      onMouseEnter={() => mode === "hover" && setHovered(true)}
      onMouseLeave={() => mode === "hover" && setHovered(false)}
      className={`flex shrink-0 flex-col gap-1 border-r border-border bg-background p-3 transition-[width] ${
        wide ? "w-44" : "w-16"
      } ${overlay ? "absolute inset-y-0 left-0 z-50" : ""} ${overlay && hovered ? "shadow-2xl" : ""}`}
    >
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
            title={wide ? undefined : item.label}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-hover"
            }`}
          >
            <item.Icon size={18} className="shrink-0" />
            {wide && item.label}
          </Link>
        );
      })}

      <div ref={menuRef} className="relative mt-auto">
        {menuOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-border bg-surface-2 p-1 shadow-xl">
            <p className="px-2 py-1.5 text-[11px] font-medium text-muted">Sidebar control</p>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => pick(m.value)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-hover"
              >
                {m.label}
                {mode === m.value && <Check size={13} />}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Sidebar control"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-hover"
        >
          <PanelLeft size={18} className="shrink-0" />
        </button>
      </div>
    </nav>
  );

  if (!overlay) return nav;
  // reserve a fixed rail's worth of space in the flow; the nav itself floats
  // absolutely above the page so expanding it never shifts the content
  return <div className="relative w-16 shrink-0">{nav}</div>;
}
