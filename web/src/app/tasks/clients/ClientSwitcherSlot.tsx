"use client";

import { usePathname } from "next/navigation";
import { ClientSwitcher, type SwitcherClient } from "./ClientSwitcher";
import { CLIENTS_SECTION, primeClientsPanel, useClientsPanelOpen } from "./clientsPanel";

// Lives in the shared /tasks layout, as a sibling of the app sidebar rather
// than inside any one page's own scrolling content — same reasoning as the
// sidebar itself: a `position: sticky` element needs a plain `top-0` to
// stick reliably for an entire scroll range, and that only works cleanly
// when nothing padded/scrolling sits between it and the real viewport (see
// ClientSwitcher's own comment for what went wrong trying to fake that
// from inside the page instead). Reads the current client id straight off
// the URL rather than a prop, so it works from the layout without every
// client page having to thread its own id down to it.
//
// It stays mounted on every page and is only *shown* in the Clients
// section — the dashboard and each client's own page — so arriving there
// slides it in and leaving slides it away, rather than it appearing whole.
export function ClientSwitcherSlot({ clients, initialOpen }: { clients: SwitcherClient[]; initialOpen: boolean }) {
  primeClientsPanel(initialOpen);
  const panelOpen = useClientsPanelOpen();
  const pathname = usePathname();
  const section = pathname.match(CLIENTS_SECTION);
  if (clients.length === 0) return null;
  return (
    <ClientSwitcher
      clients={clients}
      currentId={section?.[1] ?? null}
      onDashboard={pathname === "/tasks/clients"}
      shown={!!section && panelOpen}
    />
  );
}
