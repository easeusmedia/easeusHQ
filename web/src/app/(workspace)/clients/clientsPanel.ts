"use client";

import { useSyncExternalStore } from "react";

// The client roster panel is opened from the sidebar's Clients icon but
// rendered by ClientSwitcherSlot, and those two are siblings in the layout —
// neither can own the other's state. This is the smallest thing that lets
// both see it: a module-level value plus a subscription, no provider to wrap
// the tree in.
//
// The initial value comes from a cookie the server reads (see layout.tsx),
// the same trick the sidebar's own collapsed state uses, so the very first
// paint already matches the saved preference instead of rendering open and
// then snapping shut once an effect runs.
export const CLIENTS_PANEL_COOKIE = "clients-panel-open";

// Where the panel belongs: the Clients dashboard, one client's own page (the
// capture is that client's id), and any of a client's projects — opening a
// project shouldn't snatch the roster away.
export const CLIENTS_SECTION = /^\/(?:clients(?:\/([^/]+))?|projects\/[^/]+)$/;

let open = true;
const listeners = new Set<() => void>();

export function primeClientsPanel(initial: boolean) {
  // only before anyone has toggled it this session — a re-render of the
  // layout shouldn't undo the user's click
  if (!primed) {
    open = initial;
    primed = true;
  }
}
let primed = false;

export function toggleClientsPanel() {
  open = !open;
  primed = true;
  document.cookie = `${CLIENTS_PANEL_COOKIE}=${open ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClientsPanelOpen(): boolean {
  // server snapshot is `true` only as a placeholder — primeClientsPanel has
  // already set the real value from the cookie by the time this runs
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open
  );
}

// Which client a page belongs to when its address doesn't say — a project's
// page — so the roster can still show it as the one open. Set by that page
// (ActiveClient), cleared when it's left.
let active: string | null = null;
const activeListeners = new Set<() => void>();

export function setActiveClient(slug: string | null) {
  active = slug;
  for (const l of activeListeners) l();
}

export function useActiveClient(): string | null {
  return useSyncExternalStore(
    (l) => {
      activeListeners.add(l);
      return () => activeListeners.delete(l);
    },
    () => active,
    () => null
  );
}
