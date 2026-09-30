"use client";

import { useState } from "react";
import { ChevronDown, Plus, Repeat2, Trash2, X } from "lucide-react";
import { GRADE_LABEL, type Scoring } from "@/lib/editorKpi";
import { Dropdown } from "../../Dropdown";
import { ConfirmButton } from "../../ConfirmButton";
import { Reveal } from "../../Reveal";
import { GradeBadge, Num, PART, useRun, type CategoryView } from "../ui";
import { addCategory, deleteCategory, saveScoring, updateCategory } from "../actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface-2/30 p-5";
const row = "flex min-h-9 items-center justify-between gap-4";
const label = "min-w-0 text-sm text-muted";

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={card}>
      <p className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

// Every number the score is built from, set by the admin
export function ScoringForm({ scoring, kinds }: { scoring: Scoring; kinds: string[] }) {
  const { run, error } = useRun();
  const [d, setD] = useState(scoring);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Scoring>) => {
    setD((x) => ({ ...x, ...patch }));
    setSaved(false);
  };
  const changed = JSON.stringify(d) !== JSON.stringify(scoring);
  const unlisted = kinds.filter((k) => !(k in d.types));
  const sum = Math.round((d.quantityPoints + d.qualityPoints + d.feedbackPoints) * 10) / 10;
  const field = (text: string, key: keyof Scoring, extra: { prefix?: string; suffix?: string } = {}) => (
    <div className={row}>
      <span className={label}>{text}</span>
      <Num value={d[key] as number} onChange={(n) => n !== null && set({ [key]: n })} {...extra} />
    </div>
  );
  const Q = PART.quantity;
  const L = PART.quality;
  const F = PART.feedback;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-9 items-center justify-end gap-3">
        {error && <span className="mr-auto text-sm text-red-300">{error}</span>}
        {saved && !changed && <span className="text-sm text-muted">Saved</span>}
        {changed && (
          <button onClick={() => setD(scoring)} className="btn btn-ghost">
            Undo
          </button>
        )}
        <button
          onClick={async () => {
            setSaving(true);
            setSaved(await run(() => saveScoring(d)));
            setSaving(false);
          }}
          disabled={saving || !changed}
          className="btn btn-glow disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Score out of 10">
          {field(Q.label, "quantityPoints", { suffix: "points" })}
          {field(L.label, "qualityPoints", { suffix: "points" })}
          {field(F.label, "feedbackPoints", { suffix: "points" })}
          <p className={`border-t border-border/60 pt-3 text-right text-sm tabular-nums ${sum === 10 ? "text-muted" : "text-rose-300"}`}>Total {sum} / 10</p>
        </Card>

        <Card title="Grades">
          {(["A+", "A", "B", "C"] as const).map((g) => (
            <div key={g} className={row}>
              <span className="flex items-center gap-3">
                <GradeBadge grade={g} size="sm" />
                <span className={label}>{GRADE_LABEL[g]}</span>
              </span>
              <Num value={d.grades[g]} onChange={(n) => n !== null && set({ grades: { ...d.grades, [g]: n } })} suffix="and up" />
            </div>
          ))}
          <div className={row}>
            <span className="flex items-center gap-3">
              <GradeBadge grade="D" size="sm" />
              <span className={label}>{GRADE_LABEL.D}</span>
            </span>
            <span className="text-sm text-muted">below {d.grades.C}</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={Q.label} icon={<Q.Icon size={16} className="text-muted" />}>
          {field("Target", "reelsPerDay", { suffix: "reels a day" })}
          <div className={row}>
            <span className={label}>Working days</span>
            <span className="flex flex-wrap justify-end gap-1">
              {WEEKDAYS.map((name, i) => {
                const on = d.workDays.includes(i);
                return (
                  <button key={name} onClick={() => set({ workDays: on ? d.workDays.filter((x) => x !== i) : [...d.workDays, i].sort() })} className={`rounded-md px-2 py-1 text-sm ${on ? "bg-hover text-foreground" : "text-muted hover:text-foreground"}`}>
                    {name.slice(0, 2)}
                  </button>
                );
              })}
            </span>
          </div>
          {field("Of which, speed", "speedPoints", { suffix: "points" })}
          <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
            <p className="mb-1 text-sm font-medium">Time and worth, by type</p>
            {Object.entries(d.types).map(([kind, rule]) => (
              <div key={kind} className={row}>
                <span className={`${label} truncate`}>{kind}</span>
                <span className="flex items-center gap-2">
                  <Num value={rule.hours} onChange={(n) => n !== null && set({ types: { ...d.types, [kind]: { ...rule, hours: n } } })} suffix="h" />
                  <Num value={rule.units} onChange={(n) => n !== null && set({ types: { ...d.types, [kind]: { ...rule, units: n } } })} suffix="reels" />
                  <button
                    onClick={() => {
                      const next = { ...d.types };
                      delete next[kind];
                      set({ types: next });
                    }}
                    aria-label={`Remove ${kind}`}
                    className="grid size-7 place-items-center rounded-md text-muted hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
            ))}
            {unlisted.length > 0 && (
              <div className="mt-1 w-40">
                <Dropdown value="" placeholder="Add a type" options={unlisted.map((k) => ({ value: k, label: k }))} onChange={(k) => k && set({ types: { ...d.types, [k]: { hours: 3.5, units: 1 } } })} />
              </div>
            )}
          </div>
        </Card>

        <Card title={L.label} icon={<L.Icon size={16} className="text-muted" />}>
          {field("Each revision", "revisionPoints", { prefix: "−", suffix: "points" })}
          {field("A repeat counts", "repeatMultiplier", { prefix: "×" })}
          <p className="text-sm text-muted">Each mistake type has its own points. See Mistake types.</p>
        </Card>

        <Card title={F.label} icon={<F.Icon size={16} className="text-muted" />}>
          {field("Starts each week at", "feedbackStart", { suffix: `of ${d.feedbackPoints}` })}
          {field("Praise on Frame.io", "praisePoints", { prefix: "+" })}
        </Card>
      </div>

    </div>
  );
}

type Draft = { name: string; description: string; weight: number; keywords: string; repeats: boolean };
const input = "w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm";
const Field = ({ label: text, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1.5">
    <span className="text-sm text-muted">{text}</span>
    {children}
  </label>
);

// A type's fields, opened from its row: its name and what it means, and
// for a mistake type the points one takes off, whether repeats count, and
// the keywords that sort a Frame.io comment into it
function TypeForm({ start, mistake, onSave, onRemove, onCancel }: { start: Draft; mistake: boolean; onSave: (d: Draft) => Promise<boolean>; onRemove?: () => void; onCancel: () => void }) {
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Name">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={`${input} font-medium`} autoFocus={!start.name} />
        </Field>
        {mistake && (
          <span className="flex items-center gap-2 pb-0.5">
            <Num value={d.weight} onChange={(n) => n !== null && setD({ ...d, weight: n })} prefix="−" suffix="points" />
            <button
              type="button"
              onClick={() => setD({ ...d, repeats: !d.repeats })}
              title="The same type again, on another video, counts as a repeat"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap ${d.repeats ? "bg-rose-300/10 text-rose-300" : "bg-surface text-muted"}`}
            >
              <Repeat2 size={14} /> {d.repeats ? "Repeats count" : "No repeats"}
            </button>
          </span>
        )}
      </div>
      <Field label="What it means">
        <textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} className={`${input} resize-none`} />
      </Field>
      <Field label={mistake ? "Keywords that sort a Frame.io comment here" : "Keywords that sort a Frame.io comment here, as feedback that isn't scored"}>
        <input value={d.keywords} onChange={(e) => setD({ ...d, keywords: e.target.value })} placeholder={mistake ? "typo, spelling, misspelled" : "bgm, pacing, vibe"} className={input} />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {onRemove && (
          <ConfirmButton confirm="Remove" message={`Remove ${start.name}?${mistake ? " Its mistakes move to Others." : ""}`} className="btn btn-ghost mr-auto flex items-center gap-1.5 text-muted hover:text-red-400" onConfirm={onRemove}>
            <Trash2 size={14} /> Remove
          </ConfirmButton>
        )}
        <button onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onSave(d);
            setBusy(false);
          }}
          disabled={busy || !d.name.trim()}
          className="btn btn-glow disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// The mistake types Frame.io comments are sorted into, or the feedback
// types praise and concerns are about: a row each, opened to edit.
export function TypesPanel({ group, types }: { group: "mistake" | "feedback"; types: CategoryView[] }) {
  const { run, error } = useRun();
  const mistake = group === "mistake";
  const [open, setOpen] = useState<string | null>(null);
  const draft = (c?: CategoryView): Draft => ({ name: c?.name ?? "", description: c?.description ?? "", weight: c?.weight ?? 0.5, keywords: c?.keywords ?? "", repeats: c?.repeats ?? true });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
        {mistake && (
          <li className="flex items-center gap-4 px-4 py-2.5 text-sm text-muted">
            <span className="w-44 shrink-0">Type</span>
            <span className="hidden flex-1 sm:block">What it means</span>
            <span className="ml-auto sm:ml-0">Points off, each</span>
            <span className="w-4 shrink-0" />
          </li>
        )}
        {types.map((c) => (
          <li key={c.id}>
            <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]">
              <span className="w-44 shrink-0 truncate text-base">{c.name}</span>
              <span className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">{c.description}</span>
              {mistake && (
                <span className="ml-auto flex shrink-0 items-center gap-3 text-sm tabular-nums sm:ml-0">
                  {c.repeats && <Repeat2 size={14} className="text-rose-300" aria-label="Repeats count" />}
                  <span className="w-10 text-right">−{c.weight}</span>
                </span>
              )}
              <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${mistake ? "" : "ml-auto"} ${open === c.id ? "rotate-180" : ""}`} />
            </button>
            <Reveal open={open === c.id}>
              {open === c.id && (
                <TypeForm
                  start={draft(c)}
                  mistake={mistake}
                  onCancel={() => setOpen(null)}
                  onRemove={c.name === "Others" ? undefined : () => run(() => deleteCategory(c.id)).then((ok) => ok && setOpen(null))}
                  onSave={async (d) => {
                    const ok = await run(() => updateCategory(c.id, { ...d, group }));
                    if (ok) setOpen(null);
                    return ok;
                  }}
                />
              )}
            </Reveal>
          </li>
        ))}
        <li>
          <button onClick={() => setOpen(open === "new" ? null : "new")} className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.02] hover:text-foreground">
            <Plus size={15} /> New {mistake ? "mistake" : "feedback"} type
          </button>
          <Reveal open={open === "new"}>
            {open === "new" && (
              <TypeForm
                start={draft()}
                mistake={mistake}
                onCancel={() => setOpen(null)}
                onSave={async (d) => {
                  const ok = await run(() => addCategory({ ...d, group }));
                  if (ok) setOpen(null);
                  return ok;
                }}
              />
            )}
          </Reveal>
        </li>
      </ul>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
