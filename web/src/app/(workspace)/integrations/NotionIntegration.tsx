"use client";

import { SettingRow } from "./SettingRow";
import { saveNotionDatabase } from "./actions";

const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, "")}`;

// The two Notion databases the app reads and writes. Point either at a new
// one and Sync / Push use it from the next click — no code change. The
// connection's token stays in the server settings, never on this page.
export function NotionIntegration({
  tasks,
  clients,
}: {
  tasks: { id: string; name: string | null };
  clients: { id: string; name: string | null };
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 18px icon */}
        <img src="/notion-logo.webp" width={18} height={18} alt="" className="shrink-0" />
        <h2 className="text-base font-medium">Notion</h2>
      </div>
      <p className="-mt-2 text-sm text-muted">
        Which databases Sync and Push work against. A new one has to be shared with the Easeus HQ integration in
        Notion first.
      </p>

      <div className="flex flex-col divide-y divide-border/60 border-t border-border pt-4">
        <SettingRow
          label="Editing Queue"
          hint="Board: Sync from Notion reads it, Push to Notion writes to it."
          value={tasks.name ?? "Editing Queue (default)"}
          href={notionUrl(tasks.id)}
          placeholder="Paste the database's Notion link"
          onSave={(link) => saveNotionDatabase("tasks", link)}
        />
        <SettingRow
          label="Clients Dashboard"
          hint="Clients: Sync clients reads the roster from it."
          value={clients.name ?? "Clients Dashboard (default)"}
          href={notionUrl(clients.id)}
          placeholder="Paste the database's Notion link"
          onSave={(link) => saveNotionDatabase("clients", link)}
        />
      </div>
    </section>
  );
}
