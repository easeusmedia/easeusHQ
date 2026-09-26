"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { lastWeek, shiftDay } from "@/lib/analytics";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { refreshAnalytics } from "./actions";
import { markOurWork } from "../clients/actions";

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

// Which stretch of time the page covers — last week unless asked otherwise —
// stepped a range at a time, or picked outright.
export function RangeControls({ from, to, today, platform }: { from: string; to: string; today: string; platform: string }) {
  const router = useRouter();
  const go = (f: string, t: string) => router.push(`/analytics?platform=${platform}&from=${f}&to=${t}`);
  const week = lastWeek(today);
  const monday = shiftDay(week.to, 1);
  const presets: Record<string, { from: string; to: string }> = {
    two: lastWeek(today, 2),
    last: week,
    this: { from: monday, to: today },
    four: { from: shiftDay(week.to, -27), to: week.to },
    ninety: { from: shiftDay(today, -89), to: today },
  };
  const current = Object.entries(presets).find(([, r]) => r.from === from && r.to === to)?.[0] ?? "custom";
  const [custom, setCustom] = useState(current === "custom");
  const n = days(from, to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-surface-2/60 p-0.5">
        <button
          type="button"
          onClick={() => go(shiftDay(from, -n), shiftDay(to, -n))}
          aria-label="Earlier"
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={() => go(shiftDay(from, n), shiftDay(to, n))}
          disabled={to >= today}
          aria-label="Later"
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <Dropdown
        value={custom ? "custom" : current}
        pill={{ icon: <span className="size-1.5 rounded-full bg-sky-400" /> }}
        options={[
          { value: "two", label: "Last 2 weeks" },
          { value: "last", label: "Last week" },
          { value: "this", label: "This week so far" },
          { value: "four", label: "Last 4 weeks" },
          { value: "ninety", label: "Last 90 days" },
          { value: "custom", label: "Custom range" },
        ]}
        onChange={(v) => {
          if (v === "custom") return setCustom(true);
          setCustom(false);
          go(presets[v].from, presets[v].to);
        }}
      />
      {custom && (
        <>
          <DatePicker pill={{}} value={from} onChange={(v) => v && v <= to && go(v, to)} placeholder="From" />
          <DatePicker pill={{}} value={to} onChange={(v) => v && v >= from && go(from, v)} placeholder="To" />
        </>
      )}
    </div>
  );
}

// "Refresh", and while any scrape is running, the page quietly checking back
export function RefreshButton({ from, to, syncing, updated }: { from: string; to: string; syncing: boolean; updated: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [syncing, router]);

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-300">{error}</span>}
      <button
        type="button"
        disabled={busy || syncing}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await refreshAnalytics(from, to);
          setBusy(false);
          if (res.error) setError(res.error);
          router.refresh();
        }}
        title="Read fresh numbers now — they're also refreshed every night on their own"
        className="btn btn-sm btn-ghost disabled:opacity-60"
      >
        <RefreshCw size={13} className={busy || syncing ? "animate-spin" : ""} />
        {syncing ? "Updating…" : updated ? `Updated ${updated}` : "Refresh"}
      </button>
    </span>
  );
}

// Takes a video or post out of every number here — it wasn't ours, or it
// shouldn't count. It can be put back from the client's Analytics tab, under
// "Not ours".
export function RemoveButton({ clientId, platform, id }: { clientId: string; platform: "youtube" | "instagram"; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await markOurWork(clientId, platform, [id], false);
        router.refresh();
      }}
      title="Remove — leave it out of the numbers (it can be put back from the client's Analytics tab)"
      aria-label="Remove from analytics"
      className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 opacity-0 backdrop-blur transition-opacity duration-150 group-hover:opacity-100 hover:text-white focus-visible:opacity-100 disabled:opacity-60"
    >
      {busy ? <RefreshCw size={12} className="animate-spin" /> : <X size={14} />}
    </button>
  );
}
