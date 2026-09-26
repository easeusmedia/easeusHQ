"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Image as ImageIcon } from "lucide-react";
import { createProject } from "./actions";
import { CoverPicker } from "./CoverPicker";
import { resizeToJpeg } from "@/lib/imageResize";
import { DELIVERABLE_TYPES } from "@/lib/deliverableTypes";
import { DEFAULT_PLAN, planTasks, type PlanItem } from "@/lib/contentPlan";
import { DatePicker } from "../DatePicker";
import { Checkbox } from "../Checkbox";

// The same shape every project starts with — name, cover, and which of the
// agency's deliverable types apply — so a project set up in five minutes on
// a busy day looks identical to one set up carefully.
// `row`: a slim bar at the head of the list view instead of a tile
export function AddProjectCard({
  clientId,
  row = false,
  plan = DEFAULT_PLAN,
}: {
  clientId: string;
  row?: boolean;
  // the client's blueprint: which deliverables a project normally has, how
  // many, and when — the tasks it lays out on the content calendar
  plan?: PlanItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const usual = plan.filter((p) => p.count > 0).map((p) => p.type);
  const [types, setTypes] = useState<string[]>(usual);
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  const [start, setStart] = useState(today);
  const [planOn, setPlanOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setName("");
    setCover(null);
    setTypes(usual);
    setStart(today());
    setPlanOn(true);
    setError(null);
    dialogRef.current?.showModal();
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCover(await resizeToJpeg(file, 480, 270));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  function toggleType(t: string) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createProject(clientId, name, cover, types, planOn ? start : null);
    setSaving(false);
    if (res.error) return setError(res.error);
    dialogRef.current?.close();
    router.push(`/projects/${res.id}`);
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      <button
        onClick={open}
        className={`btn-add flex items-center justify-center gap-1.5 rounded-xl ${row ? "w-full py-2.5" : "h-full min-h-[140px] flex-col"}`}
      >
        <Plus size={18} />
        <span className="text-xs">New project</span>
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="mb-4 text-base font-semibold">New project</h2>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-dashed border-border bg-surface-2"
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1.5 text-muted">
                <ImageIcon size={18} />
                <span className="text-xs">Add a cover</span>
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickCover} className="hidden" />
          {/* most new projects reuse a cover this client already has */}
          <div className="-mt-2 flex flex-wrap items-center gap-1">
            <CoverPicker clientId={clientId} onPick={setCover} />
            {cover && (
              <button type="button" onClick={() => setCover(null)} className="btn btn-xs btn-ghost">
                Remove cover
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Episode or project name"
              className={field}
            />
          </label>

          <div className="flex flex-col gap-1.5 text-xs text-muted">
            Deliverables <span className="font-normal normal-case">(what this project will produce)</span>
            <div className="flex flex-wrap gap-1.5">
              {DELIVERABLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    types.includes(t)
                      ? "border-blue-400/40 bg-blue-400/15 text-blue-200"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {t}
                  {/* how many the blueprint makes of it, when it's more than one */}
                  {(plan.find((p) => p.type === t)?.count ?? 0) > 1 && (
                    <span className="ml-1 opacity-70">×{plan.find((p) => p.type === t)!.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* what creating it will put on the content calendar */}
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={planOn} onChange={setPlanOn} label="Plan tasks on the content calendar" size={15} />
              Plan its tasks on the content calendar
            </label>
            {planOn && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Starting
                <DatePicker pill={{}} value={start} onChange={(v) => setStart(v || today())} placeholder="Start" />
                <span>
                  {(() => {
                    const tasks = planTasks(plan, types, name.trim() || "Project", start);
                    if (!tasks.length) return "— pick a deliverable to plan";
                    const fmt = (d: string) =>
                      new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
                    return `— ${tasks.length} task${tasks.length === 1 ? "" : "s"}, due ${fmt(tasks[0].due)} to ${fmt(tasks.at(-1)!.due)}`;
                  })()}
                </span>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn btn-glow disabled:opacity-60">
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
