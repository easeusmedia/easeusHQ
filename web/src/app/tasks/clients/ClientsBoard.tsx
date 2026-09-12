"use client";

import { useOptimistic, useState, useTransition } from "react";
import { updateClientStatus } from "./actions";
import { ClientCard, type ClientCardData } from "./ClientCard";

const GROUPS: { status: string; label: string }[] = [
  { status: "current", label: "Current" },
  { status: "on_hold", label: "On hold" },
  { status: "previous", label: "Previous" },
];

// Same drag-and-drop shape as the task Board — draggable cards, one drop
// target per group — just stacked vertically instead of side-by-side
// columns, since there are only three groups and each card carries more
// at-a-glance info than a task card does.
export function ClientsBoard({ clients }: { clients: ClientCardData[] }) {
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [optimisticStatuses, applyStatus] = useOptimistic(
    new Map(clients.map((c) => [c.id, c.status])),
    (state, update: { id: string; status: string }) => new Map(state).set(update.id, update.status)
  );

  function commitStatus(id: string, status: string) {
    startTransition(async () => {
      applyStatus({ id, status });
      await updateClientStatus(id, status);
    });
  }

  function groupOf(status: string) {
    return clients.filter((c) => (optimisticStatuses.get(c.id) ?? status) === status);
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const groupClients = groupOf(group.status);
        return (
          <section key={group.status}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              {group.label} <span className="text-muted/70">({groupClients.length})</span>
            </h2>
            <div
              className="flex min-h-20 flex-wrap gap-3 rounded-xl border border-dashed border-border/60 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = draggingId;
                setDraggingId(null);
                if (id) commitStatus(id, group.status);
              }}
            >
              {groupClients.length === 0 && <p className="px-1 py-1 text-xs text-muted">Drop a client here</p>}
              {groupClients.map((client) => (
                <div
                  key={client.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(client.id);
                    // without this Firefox won't fire onDrop for a drag that
                    // never touches a text field
                    e.dataTransfer.setData("text/plain", client.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`w-64 ${draggingId === client.id ? "opacity-40" : ""}`}
                >
                  <ClientCard client={client} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
