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
