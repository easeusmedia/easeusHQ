"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, GripVertical, Plus, X } from "lucide-react";
import { updateClientTemplate, type ClientTemplateData } from "../actions";

type ListKey = "deliverables" | "onboarding";

const DOCS: { key: keyof ClientTemplateData; label: string; hint: string }[] = [
  { key: "brandGuidelines", label: "Client information", hint: "Who they are, language, fonts, brand colours" },
  { key: "sop", label: "Editing SOP", hint: "How their work gets edited, start to export" },
  { key: "qualityChecklist", label: "Quality checklist", hint: "Final pass before anything is uploaded" },
  { key: "meetingNotes", label: "Meeting notes", hint: "Starting shape for call notes" },
  { key: "resources", label: "Resources", hint: "Asset folders, templates, anything else" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint && <p className="mt-0.5 mb-4 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function DocBlock({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-muted">{hint}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <textarea
            rows={16}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

// The shape every new client is created with. Editing it here changes what
// the next client gets — existing clients keep whatever they already have.
export function TemplateEditor({ initial }: { initial: ClientTemplateData }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ClientTemplateData>(key: K, value: ClientTemplateData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function updateRow(key: ListKey, index: number, patch: Record<string, string>) {
    const rows = [...(form[key] as Record<string, string>[])];
    rows[index] = { ...rows[index], ...patch };
    set(key, rows as never);
  }

  function addRow(key: ListKey) {
    const blank = key === "deliverables" ? { name: "", detail: "" } : { title: "", detail: "" };
    set(key, [...(form[key] as Record<string, string>[]), blank] as never);
  }

  function removeRow(key: ListKey, index: number) {
    set(key, (form[key] as Record<string, string>[]).filter((_, i) => i !== index) as never);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateClientTemplate(form);
    setSaving(false);
    if (res.error) return setError(res.error);
    setSaved(true);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <div className="flex flex-col gap-4">
      <Section title="First project" hint="What a new client's starting project is called.">
        <input value={form.projectType} onChange={(e) => set("projectType", e.target.value)} className={field} />
      </Section>

      <Section title="Deliverables" hint="The contracted scope every new client starts with.">
        <div className="flex flex-col gap-2">
          {form.deliverables.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical size={14} className="shrink-0 text-muted/50" />
              <input
                value={d.name}
                onChange={(e) => updateRow("deliverables", i, { name: e.target.value })}
                placeholder="Deliverable"
                className={`${field} flex-1`}
              />
              <input
                value={d.detail}
                onChange={(e) => updateRow("deliverables", i, { detail: e.target.value })}
                placeholder="Detail — e.g. 2 per month"
                className={`${field} flex-1`}
              />
              <button onClick={() => removeRow("deliverables", i)} className="shrink-0 rounded-md p-1.5 text-red-300 hover:bg-red-500/10">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => addRow("deliverables")} className="btn-ghost flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs">
            <Plus size={13} /> Add deliverable
          </button>
        </div>
      </Section>

      <Section title="Onboarding checklist" hint="The steps ops works through for every new client.">
        <div className="flex flex-col gap-2">
          {form.onboarding.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  value={s.title}
                  onChange={(e) => updateRow("onboarding", i, { title: e.target.value })}
                  placeholder="Step"
                  className={field}
                />
                <input
                  value={s.detail}
                  onChange={(e) => updateRow("onboarding", i, { detail: e.target.value })}
                  placeholder="What it involves"
                  className={`${field} text-xs`}
                />
              </div>
              <button onClick={() => removeRow("onboarding", i)} className="mt-1.5 shrink-0 rounded-md p-1.5 text-red-300 hover:bg-red-500/10">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => addRow("onboarding")} className="btn-ghost flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs">
            <Plus size={13} /> Add step
          </button>
        </div>
      </Section>

      <Section title="Documents" hint="Starter text copied onto every new client, so nobody begins from a blank page.">
        <div className="flex flex-col gap-2">
          {DOCS.map((d) => (
            <DocBlock
              key={d.key}
              label={d.label}
              hint={d.hint}
              value={form[d.key] as string}
              onChange={(v) => set(d.key, v as never)}
            />
          ))}
        </div>
      </Section>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-2xl border border-border bg-surface/90 px-5 py-3 backdrop-blur">
        {error && <p className="mr-auto text-xs text-red-300">{error}</p>}
        {saved && !error && <p className="mr-auto text-xs text-muted">Saved — new clients will use this.</p>}
        <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
}
