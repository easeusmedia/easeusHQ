import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { clientLogoSrc } from "@/lib/photos";
import { clientHref } from "@/lib/slug";
import { istDay, lastWeek, overview, previousRange, shiftDay, type Item, type Platform } from "@/lib/analytics";
import { addressKey, collect, startSync, targets } from "@/lib/contentSync";
import { counts } from "@/lib/ourWork";
import { Avatar } from "../TaskCard";
import { InstagramIcon, YoutubeIcon } from "../PlatformIcon";
import { RangeControls, RefreshButton } from "./AnalyticsControls";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const count = (n: number) => (n < 10_000 ? Math.round(n).toLocaleString("en-IN") : compact(n));

function ago(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const c = (now - before) / before;
  const Icon = c >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${c >= 0 ? "text-emerald-300" : "text-red-300"}`}>
      <Icon size={12} />
      {Math.abs(c) >= 1 ? `${(c + 1).toFixed(1)}×` : `${Math.abs(c * 100).toFixed(0)}%`}
    </span>
  );
}

const PLATFORMS: { key: Platform; name: string; noun: string; Icon: typeof YoutubeIcon; bar: string }[] = [
  { key: "youtube", name: "YouTube", noun: "video", Icon: YoutubeIcon, bar: "bg-sky-400/80" },
  { key: "instagram", name: "Instagram", noun: "post", Icon: InstagramIcon, bar: "bg-violet-400/80" },
];

// Every client's content at once, one platform at a time — by default last
// week, Monday to Sunday: what we put out, the views it has pulled, how that
// compares with the week before, who did best and which posts carried it.
// Only our work counts (lib/ourWork.ts): a client's own posts are left out,
// and anything undecided is flagged for review on that client's tab.
// Straight from what's stored (lib/contentSync.ts), refreshed every night.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; platform?: string }>;
}) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/board");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  const q = await searchParams;
  const valid = q.from && q.to && DAY.test(q.from) && DAY.test(q.to) && q.from <= q.to;
  const { from, to } = valid ? { from: q.from!, to: q.to! } : lastWeek(today);
  const platform: Platform = q.platform === "instagram" ? "instagram" : "youtube";
  const P = PLATFORMS.find((x) => x.key === platform)!;
  const prev = previousRange(from, to);
  const href = (p: Platform) => `/analytics?platform=${p}&from=${from}&to=${to}`;

  await collect().catch(() => {});
  const all = await targets();
  const mine = all.filter((t) => t.platform === platform);
  const clientIds = [...new Set(mine.map((t) => t.clientId))];
  const [clients, accounts, rows, running] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, slug: true, avatarUrl: true } }),
    prisma.socialAccount.findMany({ where: { clientId: { in: clientIds }, platform } }),
    prisma.contentItem.findMany({
      where: {
        clientId: { in: clientIds },
        platform,
        publishedAt: { gte: new Date(`${prev.from}T00:00:00+05:30`), lt: new Date(`${shiftDay(to, 1)}T00:00:00+05:30`) },
      },
    }),
    prisma.scrapeRun.count({ where: { status: { in: ["RUNNING", "SAVING"] } } }),
  ]);

  // accounts not read back this far yet: read once, now, all in one go
  const missing = mine.filter((t) => {
    const a = accounts.find((x) => x.clientId === t.clientId);
    const handle = t.platform === "youtube" ? addressKey(t.handle) : t.handle;
    return !a || a.handle !== handle || !a.coveredSince || istDay(a.coveredSince) > prev.from;
  });
  let syncing = running > 0;
  if (missing.length && !syncing) {
    await startSync({ clientIds: [...new Set(missing.map((t) => t.clientId))], platforms: [platform], since: prev.from }).catch(() => {});
    syncing = true;
  }

  const allOurs = (clientId: string) => accounts.find((a) => a.clientId === clientId)?.allOurs ?? platform === "youtube";
  // only our work counts; what nobody has decided about yet is counted up,
  // to point at
  const counted = rows.filter((r) => counts(r.ours, allOurs(r.clientId)));
  const toReview = new Map<string, number>();
  for (const r of rows) {
    const day = istDay(r.publishedAt);
    if (r.ours === null && !allOurs(r.clientId) && day >= from && day <= to) toReview.set(r.clientId, (toReview.get(r.clientId) ?? 0) + 1);
  }

  const items: Item[] = counted.map((r) => ({
    externalId: r.externalId,
    clientId: r.clientId,
    platform,
    title: r.title,
    url: r.url,
    thumbnail: r.thumbnail,
    kind: r.kind,
    published: istDay(r.publishedAt),
    views: r.views,
    likes: r.likes,
    comments: r.comments,
  }));
  const o = overview(items, from, to);
  const client = (cid: string) => clients.find((c) => c.id === cid);
  // every client with an account here shows, even in a week with nothing of ours
  const summaries = [
    ...o.clients,
    ...clientIds
      .filter((cid) => !o.clients.some((c) => c.clientId === cid))
      .map((cid) => ({ clientId: cid, posts: 0, views: 0, previousViews: 0, youtube: { posts: 0, views: 0 }, instagram: { posts: 0, views: 0 }, top: null })),
  ];
  const beforeItems = items.filter((i) => i.published >= prev.from && i.published <= prev.to);
  const avg = o.posts ? o.views / o.posts : 0;
  const avgBefore = beforeItems.length ? o.previousViews / beforeItems.length : 0;
  const lastRead = accounts.reduce<Date | null>((m, a) => (a.scrapedAt && (!m || a.scrapedAt > m) ? a.scrapedAt : m), null);
  const isLastWeek = from === lastWeek(today).from && to === lastWeek(today).to;
  const peak = Math.max(1, ...o.series.map((d) => d.youtube + d.instagram));
  const reviewTotal = [...toReview.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {isLastWeek ? "Last week" : "From"} · {short(from)} – {short(to)} {to.slice(0, 4) !== today.slice(0, 4) && to.slice(0, 4)} · what
            we made for every client
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls from={from} to={to} today={today} platform={platform} />
          <RefreshButton from={from} to={to} syncing={syncing} updated={lastRead ? ago(lastRead) : null} />
        </div>
      </div>

      {/* one platform at a time — their numbers don't add up to anything */}
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface/60 p-1">
        {PLATFORMS.map((x) => (
          <Link
            key={x.key}
            href={href(x.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              platform === x.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <x.Icon size={15} /> {x.name}
          </Link>
        ))}
      </div>

      {clientIds.length === 0 ? (
        <p className="card-surface rounded-2xl px-6 py-12 text-center text-sm text-muted shadow-sm">
          No client has a {P.name} account set yet — add it on each client&apos;s Analytics tab.
        </p>
      ) : (
        <div key={platform} className="fade-in flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Views pulled", value: count(o.views), change: <Change now={o.views} before={o.previousViews} />, sub: `vs ${count(o.previousViews)} the period before` },
              { label: `${P.noun[0].toUpperCase()}${P.noun.slice(1)}s published`, value: count(o.posts), change: <Change now={o.posts} before={o.previousPosts} />, sub: `vs ${o.previousPosts} the period before` },
              { label: `Avg views per ${P.noun}`, value: count(avg), change: <Change now={avg} before={avgBefore} />, sub: avgBefore ? `vs ${count(avgBefore)} the period before` : " " },
              { label: "Likes and comments", value: count(o.likes + o.comments), sub: `${count(o.likes)} likes · ${count(o.comments)} comments` },
            ].map((t) => (
              <div key={t.label} className="card-surface flex flex-col gap-1 rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-xs text-muted">{t.label}</p>
                <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                  {t.value} {t.change}
                </p>
                <p className="text-xs text-muted">{t.sub}</p>
              </div>
            ))}
          </div>

          <section className="card-surface rounded-2xl p-5 shadow-sm">
            <p className="mb-4 text-sm font-medium">Views, by the day each {P.noun} went up</p>
            <div className="flex h-32 items-end gap-1">
              {o.series.map((d) => {
                const v = d.youtube + d.instagram;
                return (
                  <div key={d.day} title={`${short(d.day)} — ${count(v)} views`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className={`rounded-t-sm ${P.bar}`} style={{ height: `${(v / peak) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>{short(from)}</span>
              <span>peak {count(peak)}</span>
              <span>{short(to)}</span>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">By client</h2>
              {reviewTotal > 0 && (
                <p className="text-xs text-amber-300">
                  {reviewTotal} {P.noun}
                  {reviewTotal === 1 ? "" : "s"} not yet marked ours or theirs — left out until someone does
                </p>
              )}
            </div>
            <div className="card-surface overflow-hidden rounded-2xl shadow-sm">
              <div className="hidden grid-cols-[minmax(0,1.3fr)_5rem_8rem_6rem_minmax(0,1.8fr)] gap-4 px-5 py-2 text-xs text-muted md:grid">
                <span>Client</span>
                <span className="text-right">{P.noun[0].toUpperCase() + P.noun.slice(1)}s</span>
                <span className="text-right">Views</span>
                <span className="text-right">Avg</span>
                <span>Best {P.noun}</span>
              </div>
              {summaries.map((s) => {
                const c = client(s.clientId);
                if (!c) return null;
                const logo = clientLogoSrc(c);
                const review = toReview.get(s.clientId) ?? 0;
                return (
                  <Link
                    key={s.clientId}
                    href={`${clientHref(c)}?tab=analytics`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-border/50 px-5 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,1.3fr)_5rem_8rem_6rem_minmax(0,1.8fr)]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
                        <img src={logo} alt="" className="photo h-7 w-7" />
                      ) : (
                        <Avatar name={c.name} size={28} presence={false} />
                      )}
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      {review > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">{review} to review</span>
                      )}
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-muted md:block">{s.posts}</span>
                    <span className="flex items-center justify-end gap-2 text-sm font-semibold tabular-nums">
                      {count(s.views)} <Change now={s.views} before={s.previousViews} />
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-muted md:block">{s.posts ? count(s.views / s.posts) : "—"}</span>
                    <span className="col-span-2 flex min-w-0 items-center gap-2 text-xs text-muted md:col-span-1">
                      {s.top ? (
                        <>
                          <span className="truncate">{s.top.title}</span>
                          <span className="shrink-0 tabular-nums text-foreground/80">{count(s.top.views ?? 0)}</span>
                        </>
                      ) : (
                        `No ${P.noun}s of ours in this range`
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {o.top.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Top {P.noun}s</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                {o.top.slice(0, 8).map((i) => (
                  <a
                    key={i.externalId}
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-surface card-interactive flex flex-col overflow-hidden rounded-xl shadow-sm"
                  >
                    <span className={`relative block w-full overflow-hidden bg-surface-2 ${platform === "youtube" && i.kind === "Video" ? "aspect-video" : "aspect-[4/5]"}`}>
                      {i.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
                        <img src={i.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">{i.kind}</span>
                    </span>
                    <span className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-base font-semibold tabular-nums">{count(i.views ?? 0)} views</span>
                      <span className="truncate text-xs text-muted">
                        {client(i.clientId)?.name} · {short(i.published)}
                      </span>
                      <span className="truncate text-xs text-foreground/80">{i.title}</span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <p className="text-xs text-muted">
            Views so far on what we published in the range, from each account&apos;s public page. A {P.noun} counts when it
            matches one of our tasks or someone marks it ours; channels we run count in full. Refreshed every night — recent{" "}
            {P.noun}s daily, older ones weekly.
            {syncing && " Reading the latest now; this page updates when it's done."}
          </p>
        </div>
      )}
    </div>
  );
}
