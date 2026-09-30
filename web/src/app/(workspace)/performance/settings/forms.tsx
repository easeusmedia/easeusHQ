"use client";

import { useState } from "react";
import { Plus, Repeat2, Trash2, X } from "lucide-react";
import type { Scoring } from "@/lib/editorKpi";
import { Dropdown } from "../../Dropdown";
import { ConfirmButton } from "../../ConfirmButton";
import { GradeBadge, Info, Num, PART, useRun, type CategoryView } from "../ui";
import { addCategory, deleteCategory, saveScoring, updateCategory } from "../actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/30 p-5";
const row = "flex items-center justify-between gap-3 text-sm";
const head = "flex items-center gap-1.5 text-sm font-semibold";

// Every number the score is built from, set by the admin: the 10 points,
// the grades, and what goes into each metric.
export function ScoringForm({ scoring, kinds }: { scoring: Scoring; kinds: string[] }) {
  const { run, error } = useRun();
  const [d, setD] = useState(scoring);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Scoring>) => {
    setD({ ...d, ...patch });
    setSaved(false);
  };
  const unlisted = kinds.filter((k) => !(k in d.types));
  const sum = Math.round((d.outputPoints + d.speedPoints + d.qualityPoints + d.ratingPoints) * 10) / 10;
  const field = (label: string, key: keyof Scoring, suffix?: string) => (
    <div className={row}>
      <span className="text-muted">{label}</span>
      <Num value={d[key] as number} onChange={(n) => n !== null && set({ [key]: n })} suffix={suffix} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <p className={head}>Points</p>
          <p className="-mt-2 text-xs text-muted">What each metric is worth. Together they make 10.</p>
          {field("Output: reels against the target", "outputPoints")}
          {field("Speed: Editing to approval in time", "speedPoints")}
          {field("Quality: mistakes per video", "qualityPoints")}
          {field("Rating: praise and concerns", "ratingPoints")}
          <p className={`text-right text-xs tabular-nums ${sum === 10 ? "text-muted" : "text-rose-300"}`}>{sum} of 10</p>
        </div>

        <div className={card}>
          <p className={head}>Grades</p>
          <p className="-mt-2 text-xs text-muted">The lowest total out of 10 for each grade.</p>
          {(["A+", "A", "B", "C"] as const).map((g) => (
            <div key={g} className={row}>
              <GradeBadge grade={g} size="sm" label />
              <Num value={d.grades[g]} onChange={(n) => n !== null && set({ grades: { ...d.grades, [g]: n } })} suffix="and up" />
            </div>
          ))}
          <div className={row}>
            <GradeBadge grade="D" size="sm" label />
            <span className="text-xs text-muted">Below {d.grades.C}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <p className={head}>
            {PART.quantity.label} <Info label={PART.quantity.label} text={PART.quantity.means} />
          </p>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((name, i) => {
              const on = d.workDays.includes(i);
              return (
                <button key={name} onClick={() => set({ workDays: on ? d.workDays.filter((x) => x !== i) : [...d.workDays, i].sort() })} className={`rounded-md px-2 py-1 text-xs ${on ? "bg-hover text-foreground" : "bg-surface text-muted"}`}>
                  {name}
                </button>
              );
            })}
          </div>
          {field("Reels a working day", "reelsPerDay")}
          <p className="mt-2 text-sm font-medium">Each type: its standard time and what it counts for</p>
          {Object.entries(d.types).map(([kind, rule]) => (
            <div key={kind} className={row}>
              <span className="min-w-0 truncate text-muted">{kind}</span>
              <span className="flex items-center gap-1">
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
                  <X size={13} />
                </button>
              </span>
            </div>
          ))}
          {unlisted.length > 0 && <Dropdown value="" placeholder="Add a type" size="sm" options={unlisted.map((k) => ({ value: k, label: k }))} onChange={(k) => k && set({ types: { ...d.types, [k]: { hours: 3.5, units: 1 } } })} />}
          <p className="text-xs text-muted">Time runs from Editing to Sent for approval. A type not listed counts as a reel.</p>
        </div>

        <div className={card}>
          <p className={head}>
            {PART.quality.label} <Info label={PART.quality.label} text={PART.quality.means} />
          </p>
          {field("Points off for each mistake per video", "mistakePoints")}
          {field("A revision counts as", "revisionWeight", "mistakes")}
          {field("A repeated mistake counts as", "repeatWeight", "mistakes")}
          <p className="text-xs text-muted">Each mistake type has its own weight too, under Mistake types.</p>
        </div>

        <div className={card}>
          <p className={head}>
            {PART.rating.label} <Info label={PART.rating.label} text={PART.rating.means} />
          </p>
          {field("Starts each week at", "ratingStart", `of ${d.ratingPoints}`)}
          {field("Praise from Frame.io adds", "praisePoints")}
          <p className="text-xs text-muted">Praise and concerns added by hand carry the points you give them.</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {error && <span className="mr-auto text-xs text-red-300">{error}</span>}
        {saved && <span className="text-xs text-muted">Saved. Every score now uses these.</span>}
        <button onClick={() => setD(scoring)} className="btn btn-sm btn-ghost">
          Undo changes
        </button>
        <button
          onClick={async () => {
            setSaving(true);
            setSaved(await run(() => saveScoring(d)));
            setSaving(false);
          }}
          disabled={saving}
          className="btn btn-sm btn-glow disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save scoring"}
        </button>
      </div>
    </div>
  );
}

// Whether the same type again, on another video, counts as a repeat
function RepeatsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      title={on ? "The same type again, on another video, counts as a repeat" : "Repeats of this type aren't counted"}
      className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${on ? "bg-rose-300/10 text-rose-300" : "bg-surface text-muted"}`}
    >
      <Repeat2 size={12} /> {on ? "Repeats" : "No repeats"}
    </button>
  );
}

type Draft = { name: string; description: string; weight: number; keywords: string; repeats: boolean };
const blank: Draft = { name: "", description: "", weight: 1, keywords: "", repeats: true };
const input = "min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm";

// One type's fields: its name and what it means, and for a mistake type
// its weight, whether repeats count, and its keywords
function TypeFields({ d, set, mistake }: { d: Draft; set: (d: Draft) => void; mistake: boolean }) {
  return (
    <>
      <input value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} placeholder={mistake ? "New mistake type" : "New feedback type"} className={`${input} font-medium`} />
      <input value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} placeholder="What it means, shown behind the (i)" className={input} />
      {mistake && (
        <>
          <span className="flex items-center gap-2">
            <Num value={d.weight} onChange={(n) => n !== null && set({ ...d, weight: n })} suffix="counts" />
            <RepeatsToggle on={d.repeats} onChange={(repeats) => set({ ...d, repeats })} />
          </span>
          <input value={d.keywords} onChange={(e) => set({ ...d, keywords: e.target.value })} placeholder="Keywords that put a Frame.io comment here, comma-separated" className={`${input} md:col-span-2 md:col-start-2`} />
        </>
      )}
    </>
  );
}

function TypeRow({ c }: { c: CategoryView }) {
  const { run, error } = useRun();
  const mistake = c.group === "mistake";
  const start: Draft = { name: c.name, description: c.description ?? "", weight: c.weight, keywords: c.keywords ?? "", repeats: c.repeats };
  const [d, setD] = useState(start);
  const changed = JSON.stringify(d) !== JSON.stringify(start);
  const grid = mistake ? "md:grid-cols-[12rem_minmax(0,1fr)_auto_5rem]" : "md:grid-cols-[12rem_minmax(0,1fr)_5rem]";
  return (
    <li className={`grid items-center gap-2 px-4 py-3 ${grid}`}>
      <TypeFields d={d} set={setD} mistake={mistake} />
      <span className={`flex items-center justify-end gap-1 ${mistake ? "md:col-start-4 md:row-start-1" : ""}`}>
        {changed && (
          <button onClick={() => run(() => updateCategory(c.id, { ...d, group: c.group }))} className="btn btn-xs btn-glow">
            Save
          </button>
        )}
        {c.name !== "Others" && (
          <ConfirmButton
            confirm="Remove"
            message={mistake ? `Remove ${c.name}? Its mistakes move to Others.` : `Remove ${c.name}? Praise and concerns about it keep their points.`}
            className="grid size-7 place-items-center rounded-md text-muted hover:text-red-400"
            onConfirm={() => run(() => deleteCategory(c.id))}
          >
            <Trash2 size={13} />
          </ConfirmButton>
        )}
      </span>
      {error && <p className="text-xs text-red-300 md:col-span-4">{error}</p>}
    </li>
  );
}

// The mistake types Frame.io comments are sorted into, or the feedback
// types praise and concerns are about: each with what it means, and core
// can add, rename or remove any.
export function TypesPanel({ group, types }: { group: "mistake" | "feedback"; types: CategoryView[] }) {
  const { run, error } = useRun();
  const mistake = group === "mistake";
  const [d, setD] = useState<Draft>(blank);
  const [n, setN] = useState(0);
  const grid = mistake ? "md:grid-cols-[12rem_minmax(0,1fr)_auto_5rem]" : "md:grid-cols-[12rem_minmax(0,1fr)_5rem]";
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
        {types.map((c) => (
          <TypeRow key={`${c.id}:${c.name}:${c.weight}:${c.keywords}:${c.description}:${c.repeats}`} c={c} />
        ))}
        <li key={n} className={`grid items-center gap-2 bg-surface-2/30 px-4 py-3 ${grid}`}>
          <TypeFields d={d} set={setD} mistake={mistake} />
          <span className={`flex justify-end ${mistake ? "md:col-start-4 md:row-start-1" : ""}`}>
            <button
              onClick={async () => {
                if (await run(() => addCategory({ ...d, group }))) {
                  setD(blank);
                  setN((x) => x + 1);
                }
              }}
              disabled={!d.name.trim()}
              className="btn btn-xs btn-glow flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={12} /> Add
            </button>
          </span>
        </li>
      </ul>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
