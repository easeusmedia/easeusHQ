"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import type { ContentRow, Dashboard, Format, Metric, Platform } from "@/lib/analytics";
import { shiftDay } from "@/lib/analytics";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { saveAnalyticsAccount } from "./actions";
import { InstagramIcon, YoutubeIcon } from "../PlatformIcon";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const PLATFORM: Record<Platform, { name: string; Logo: typeof YoutubeIcon; kinds: string[] }> = {
  youtube: { name: "YouTube", Logo: YoutubeIcon, kinds: ["Video", "Short"] },
  instagram: { name: "Instagram", Logo: InstagramIcon, kinds: ["Reel", "Post", "Carousel"] },
};

// One client's content performance, per platform: how the channel or
// account did over the range (the headline numbers, against the period
// before), how it moved day by day, and every piece of content ranked — so
// nobody has to open YouTube or Instagram to know what's working. Public
// numbers only: all it needs is the client's channel link and handle. Loads
// only when the tab is actually opened.
export function ClientAnalytics({
  clientId,
  accounts,
  ready,
  canEdit,
  today,
}: {
  clientId: string;
  // their channel link / @handle, and Instagram @handle, if known
  accounts: Record<Platform, string | null>;
  // whether the team's own connection for that platform is made (Integrations)
  ready: Record<Platform, boolean>;
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [range, setRange] = useState("28");
  const [custom, setCustom] = useState({ from: shiftDay(today, -27), to: today });
  const { from, to } = range === "custom" ? custom : { from: shiftDay(today, -(Number(range) - 1)), to: today };
  const account = accounts[platform];
  const [editing, setEditing] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  // syncing: a scrape for this account is under way — the stored numbers
  // show meanwhile, and it's asked about again shortly
  const [data, setData] = useState<Record<string, { dashboard?: Dashboard; error?: string; pending?: boolean; syncing?: boolean }>>({});
  const [poll, setPoll] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const key = `${platform}:${account}:${from}:${to}`;
  const current = data[key];
  const live = !!account && ready[platform] && !editing;

  // the tab's panel is hidden until opened; nothing is fetched before that
  useEffect(() => {
    const el = rootRef.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true));
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || !live || (current && !current.syncing && !refresh)) return;
    let alive = true;
    // a scrape still running is asked about again in a few seconds
    const wait = setTimeout(
      () => {
        setLoading(true);
        fetch(`/api/analytics/${clientId}?platform=${platform}&from=${from}&to=${to}${refresh ? "&refresh=1" : ""}`)
          .then((r) => r.json())
          .then((body) => {
            if (!alive) return;
            setData((d) => ({
              ...d,
              [key]: { dashboard: body.dashboard, error: body.error, pending: !!body.pending, syncing: !!body.syncing },
            }));
            if (body.syncing) setPoll((n) => n + 1);
          })
          .catch(() => alive && setData((d) => ({ ...d, [key]: { error: "Couldn't reach the server." } })))
          .finally(() => {
            if (!alive) return;
            setLoading(false);
            setRefresh(0);
          });
      },
      current?.syncing && !refresh ? 6000 : 0
    );
    return () => {
      alive = false;
      clearTimeout(wait);
    };
    // `current` is read, not watched: a new key, a refresh or a poll is what fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, live, clientId, platform, account, from, to, refresh, poll]);

  const d = current?.dashboard;

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-border bg-surface/60 p-1">
          {(Object.keys(PLATFORM) as Platform[]).map((p) => {
            const { name, Logo } = PLATFORM[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlatform(p);
                  setEditing(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  platform === p ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Logo /> {name}
              </button>
            );
          })}
        </div>
        {live && (
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown value={range} options={RANGES} onChange={setRange} pill={{ icon: <span className="size-1.5 rounded-full bg-sky-400" /> }} />
            {range === "custom" && (
              <>
                <DatePicker pill={{}} value={custom.from} onChange={(v) => v && setCustom((c) => ({ ...c, from: v }))} placeholder="From" />
                <DatePicker pill={{}} value={custom.to} onChange={(v) => v && setCustom((c) => ({ ...c, to: v }))} placeholder="To" />
              </>
            )}
            <button
              type="button"
              onClick={() => setRefresh(1)}
              disabled={loading || !!current?.syncing}
              title="Read fresh numbers now — they're also refreshed every night on their own"
              className="btn btn-sm btn-ghost disabled:opacity-60"
            >
              <RefreshCw size={13} className={current?.syncing ? "animate-spin" : ""} />
              {current?.syncing ? "Updating…" : d && Date.parse(d.fetchedAt) > 0 ? `Updated ${ago(d.fetchedAt)}` : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {!ready[platform] ? (
        <Notice platform={platform}>
          The team&apos;s {PLATFORM[platform].name} connection isn&apos;t made yet — an admin makes it once, under
          Integrations → Client analytics.
        </Notice>
      ) : !account || editing ? (
        <AccountForm
          clientId={clientId}
          platform={platform}
          value={account}
          canEdit={canEdit}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={account ? () => setEditing(false) : undefined}
        />
      ) : (
        <div key={platform} className="fade-in flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            {d?.account.image && (
              // eslint-disable-next-line @next/next/no-img-element -- the platform's own small avatar
              <img src={d.account.image} alt="" className="photo h-10 w-10" />
            )}
            <div className="min-w-0">
              <a
                href={d?.account.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                {d?.account.name ?? account} <ExternalLink size={12} className="text-muted" />
              </a>
              <p className="text-xs text-muted">
                {d?.account.followers != null
                  ? `${compact(d.account.followers)} ${platform === "youtube" ? "subscribers" : "followers"}`
                  : PLATFORM[platform].name}
              </p>
            </div>
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-ghost ml-auto">
                <Pencil size={11} /> Change
              </button>
            )}
          </div>

          {current?.error ? (
            <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{current.error}</p>
          ) : !d || (current?.pending && !d.rows.length) ? (
            <div className="flex flex-col gap-3">
              {current?.pending && (
                <p className="fade-in flex items-center gap-2 text-sm text-muted">
                  <RefreshCw size={13} className="animate-spin" />
                  Reading their {PLATFORM[platform].name} for the first time — a minute or two. After that it opens
                  straight away, and it&apos;s kept up to date every night.
                </p>
              )}
              <Skeleton />
            </div>
          ) : (
            <Board dashboard={d} platform={platform} loading={loading} />
          )}
        </div>
      )}
    </div>
  );
}

function Board({ dashboard: d, platform, loading }: { dashboard: Dashboard; platform: Platform; loading: boolean }) {
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState(d.columns[0].key);
  const headline = d.metrics.slice(0, 4);
  const rest = d.metrics.slice(4);
  const days = Math.round((Date.parse(d.to) - Date.parse(d.from)) / 86_400_000) + 1;

  // the number each row is ranked by, drawn as a bar against the best
  const barKey = sort === "newest" ? d.columns[0].key : sort;
  const barFormat = d.columns.find((c) => c.key === barKey)?.format ?? "count";
  const rows = useMemo(
    () =>
      d.rows
        .filter((r) => kind === "all" || r.kind === kind)
        .sort((a, b) =>
          sort === "newest" ? b.published.localeCompare(a.published) : (b.stats[sort] ?? -1) - (a.stats[sort] ?? -1)
        ),
    [d, kind, sort]
  );
  const top = Math.max(1, ...rows.map((r) => r.stats[barKey] ?? 0));

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
      {/* the four numbers that answer "how's it going" */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headline.map((m) => (
          <Tile key={m.key} metric={m} days={days} />
        ))}
      </div>
      <div className="card-surface flex flex-wrap gap-x-8 gap-y-3 rounded-2xl px-5 py-4 shadow-sm">
        {rest.map((m) => (
          <div key={m.key} title={m.hint}>
            <p className="text-xs text-muted">{m.label}</p>
            <p className="flex items-baseline gap-1.5 text-base font-semibold tabular-nums">
              {fmt(m.value, m.format)}
              <Delta metric={m} small />
            </p>
          </div>
        ))}
      </div>

      <section className="card-surface rounded-2xl p-5 shadow-sm">
        <p className="mb-4 text-sm font-medium">{d.seriesLabel}</p>
        <Chart series={d.series} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium">
            {platform === "youtube" ? "Videos" : "Posts"}{" "}
            <span className="text-muted">
              · {d.rows.length} {platform === "youtube" ? "watched or uploaded in this range" : "published in this range"}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <Dropdown
              value={kind}
              onChange={setKind}
              pill={{ icon: <span className="size-1.5 rounded-full bg-violet-400" /> }}
              options={[{ value: "all", label: "All" }, ...PLATFORM[platform].kinds.map((k) => ({ value: k, label: `${k}s` }))]}
            />
            <Dropdown
              value={sort}
              onChange={setSort}
              pill={{ icon: <span className="size-1.5 rounded-full bg-amber-400" /> }}
              options={[
                ...d.columns.map((c) => ({ value: c.key, label: `Most ${c.label.toLowerCase()}` })),
                { value: "newest", label: "Newest first" },
              ]}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl bg-surface/40 px-4 py-8 text-center text-sm text-muted">Nothing in this range.</p>
        ) : (
          <ol className="card-surface divide-y divide-border/50 overflow-hidden rounded-2xl shadow-sm">
            {rows.map((r, i) => (
              <ContentItem
                key={r.id}
                row={r}
                rank={i + 1}
                columns={d.columns}
                bar={(r.stats[barKey] ?? 0) / top}
                barValue={fmt(r.stats[barKey] ?? null, barFormat)}
                highlight={barKey}
              />
            ))}
          </ol>
        )}
      </section>

      {d.notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {d.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ metric: m, days }: { metric: Metric; days: number }) {
  return (
    <div className="card-surface flex flex-col gap-1 rounded-2xl px-5 py-4 shadow-sm" title={m.hint}>
      <p className="text-xs text-muted">{m.label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${m.value === null ? "text-muted" : ""}`}>{fmt(m.value, m.format)}</p>
      {m.previous != null && m.value != null ? (
        <p className="flex items-center gap-1 text-xs text-muted">
          <Delta metric={m} /> vs previous {days} days
        </p>
      ) : (
        <p className="text-xs text-muted/70">{m.value === null ? "Not available yet" : " "}</p>
      )}
    </div>
  );
}

function Delta({ metric: m, small = false }: { metric: Metric; small?: boolean }) {
  if (m.previous == null || m.value == null || m.previous === 0) return null;
  const change = (m.value - m.previous) / Math.abs(m.previous);
  const up = change >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 font-medium ${small ? "text-xs" : ""} ${up ? "text-emerald-300" : "text-red-300"}`}>
      <Icon size={small ? 11 : 12} />
      {Math.abs(change * 100) >= 100 ? `${(change + 1).toFixed(1)}×` : `${Math.abs(change * 100).toFixed(0)}%`}
    </span>
  );
}

// One video or post: where it ranks, what it is, the number it's ranked by
// as a bar against the best, and the rest of its numbers underneath.
function ContentItem({
  row: r,
  rank,
  columns,
  bar,
  barValue,
  highlight,
}: {
  row: ContentRow;
  rank: number;
  columns: Dashboard["columns"];
  bar: number;
  barValue: string;
  highlight: string;
}) {
  const square = r.kind !== "Video";
  return (
    <li>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-surface-2/50"
      >
        <span className="w-6 shrink-0 pt-1 text-right text-xs tabular-nums text-muted">{rank}</span>
        <span className={`shrink-0 overflow-hidden rounded-lg bg-surface-2 ${square ? "h-16 w-16" : "aspect-video w-28"}`}>
          {r.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
            <img src={r.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{r.title}</span>
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{r.kind}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="h-1.5 max-w-64 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${Math.max(2, bar * 100)}%` }} />
            </span>
            <span className="text-sm font-semibold tabular-nums">{barValue}</span>
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
            <span>{shortDate(r.published)}</span>
            {columns
              .filter((c) => c.key !== highlight && r.stats[c.key] != null)
              .map((c) => (
                <span key={c.key}>
                  <span className="text-foreground/80 tabular-nums">{fmt(r.stats[c.key], c.format)}</span> {c.label.toLowerCase()}
                </span>
              ))}
          </span>
        </span>
      </a>
    </li>
  );
}

// Day by day, as an area: hover for the day and its number.
function Chart({ series }: { series: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = 180;
  const max = Math.max(1, ...series.map((s) => s.value));
  const x = (i: number) => (series.length < 2 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 8);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
  const h = hover === null ? null : series[hover];

  return (
    <div className="relative">
      <div
        className="relative h-44"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - box.left) / box.width) * (series.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(56 189 248)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {series.length > 0 && <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#area)" />}
          <path d={line} fill="none" stroke="rgb(56 189 248)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {h && hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="currentColor" className="text-foreground/30" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {h && hover !== null && (
          <span
            className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <span className="font-semibold tabular-nums">{h.value.toLocaleString("en-IN")}</span>{" "}
            <span className="text-muted">{shortDate(h.day)}</span>
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{series[0] && shortDate(series[0].day)}</span>
        <span>peak {compact(max)}</span>
        <span>{series.at(-1) && shortDate(series.at(-1)!.day)}</span>
      </div>
    </div>
  );
}

// Which channel or account this client's numbers come from: a link or
// @handle, nothing more — no login, nothing asked of the client.
function AccountForm({
  clientId,
  platform,
  value,
  canEdit,
  onDone,
  onCancel,
}: {
  clientId: string;
  platform: Platform;
  value: string | null;
  canEdit: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { name } = PLATFORM[platform];

  async function save() {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    const res = await saveAnalyticsAccount(clientId, platform, input);
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
  }

  return (
    <Notice platform={platform}>
      {canEdit ? (
        <>
          <span className="block">
            Their {name} {platform === "youtube" ? "channel link or @handle" : "@handle or profile link"} — their public
            numbers show here from then on.
          </span>
          <span className="mt-4 flex w-full max-w-md gap-2">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={platform === "youtube" ? "youtube.com/@channel" : "@handle"}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn btn-ghost shrink-0">
                Cancel
              </button>
            )}
            <button type="button" onClick={save} disabled={busy || !input.trim()} className="btn btn-glow shrink-0 disabled:opacity-60">
              {busy ? "Saving…" : "Show"}
            </button>
          </span>
          {error && <span className="mt-2 block text-xs text-red-300">{error}</span>}
        </>
      ) : (
        `No ${name} account set for this client yet.`
      )}
    </Notice>
  );
}

function Notice({ platform, children }: { platform: Platform; children: React.ReactNode }) {
  const { name, Logo } = PLATFORM[platform];
  return (
    <div className="card-surface flex flex-col items-center gap-2 rounded-2xl px-6 py-12 text-center shadow-sm">
      <Logo size={26} className="text-muted" />
      <p className="mt-2 text-base font-medium">{name}</p>
      <div className="flex max-w-lg flex-col items-center text-sm text-muted">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface-2/60" />
        ))}
      </div>
      <div className="h-56 rounded-2xl bg-surface-2/60" />
      <div className="h-72 rounded-2xl bg-surface-2/60" />
    </div>
  );
}

function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function fmt(v: number | null | undefined, format: Format): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (format === "seconds") return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  if (format === "hours") return v < 10 ? `${v.toFixed(1)}h` : `${compact(v)}h`;
  return v < 10_000 ? Math.round(v).toLocaleString("en-IN") : compact(v);
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
