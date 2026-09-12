"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, RefreshCw } from "lucide-react";
import { importFromNotion, setNotionContentDb } from "./actions";

// While the team is still finishing in Notion, this pulls a client's
// episodes, their files, and the editor-workbook documents across. Paste the
// client's own content database and press Import — it used to be a script
// with the id hard-coded, which meant only I could run it.
export function ClientNotionLink({ clientId, contentDbId }: { clientId: string; contentDbId: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(contentDbId ?? "");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    await setNotionContentDb(clientId, value);
    setSaving(false);
    router.refresh();
  }

  async function run() {
    setImporting(true);
    setMessage(null);
    const res = await importFromNotion(clientId);
    setImporting(false);
    setMessage(
      res.error
        ? res.error
        : `Imported ${res.projects} project${res.projects === 1 ? "" : "s"}, ${res.assets} file${
            res.assets === 1 ? "" : "s"
          } and ${res.docs} document${res.docs === 1 ? "" : "s"}.`
    );
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center gap-2">
        <Database size={15} className="text-muted" />
        <h3 className="text-sm font-medium">Import from Notion</h3>
      </div>
      <p className="mb-3 text-xs text-muted">
        Paste this client&apos;s content database link — the one with a row per episode. Importing pulls their
        projects, the files inside each, and their editor-workbook documents.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://notion.so/…  or the database id"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
        <button
          onClick={save}
          disabled={saving || value === (contentDbId ?? "")}
          className="btn-ghost shrink-0 rounded-lg px-3 py-2 text-xs disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save link"}
        </button>
        <button
          onClick={run}
          disabled={importing || !contentDbId}
          className="btn-glow flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40"
        >
          <RefreshCw size={13} className={importing ? "animate-spin" : undefined} />
          {importing ? "Importing…" : "Import"}
        </button>
      </div>

      {message && <p className="mt-2 text-xs text-muted">{message}</p>}
    </section>
  );
}
