import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { clientLogoSrc } from "@/lib/photos";
import { clientHref } from "@/lib/slug";
import { istDay, lastWeek, overview, previousRange, shiftDay, type Item } from "@/lib/analytics";
import { addressKey, collect, startSync, targets } from "@/lib/contentSync";
import { Avatar } from "../TaskCard";
import { InstagramIcon, YoutubeIcon } from "../PlatformIcon";
import { RangeControls, RefreshButton } from "./AnalyticsControls";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const count = (n: number) => (n < 10_000 ? n.toLocaleString("en-IN") : compact(n));

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

// Every client's content at once — by default last week, Monday to Sunday:
// what went out, the views it has pulled, how that compares with the week
// before, who did best and which posts carried it. Straight from what's
// stored (lib/contentSync.ts), refreshed every night; a range reaching back
// further than anything read yet is read once, on the way in.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/board");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  const q = await searchParams;
  const valid = q.from && q.to && DAY.test(q.from) && DAY.test(q.to) && q.from <= q.to;
  const { from, to } = valid ? { from: q.from!, to: q.to! } : lastWeek(today);
  const prev = previousRange(from, to);

  await collect().catch(() => {});
  const all = await targets();
  const clientIds = [...new Set(all.map((t) => t.clientId))];
  const [clients, accounts, rows, running] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, slug: true, avatarUrl: true } }),
    prisma.socialAccount.findMany({ where: { clientId: { in: clientIds } } }),
    prisma.contentItem.findMany({
      where: {
        clientId: { in: clientIds },
        publishedAt: { gte: new Date(`${prev.from}T00:00:00+05:30`), lt: new Date(`${shiftDay(to, 1)}T00:00:00+05:30`) },
      },
    }),
    prisma.scrapeRun.count({ where: { status: { in: ["RUNNING", "SAVING"] } } }),
  ]);

  // accounts not read back this far yet: read once, now, all in one go
  const missing = all.filter((t) => {
    const a = accounts.find((x) => x.clientId === t.clientId && x.platform === t.platform);
    const handle = t.platform === "youtube" ? addressKey(t.handle) : t.handle;
    return !a || a.handle !== handle || !a.coveredSince || istDay(a.coveredSince) > prev.from;
  });
  let syncing = running > 0;
  if (missing.length && !syncing) {
    await startSync({ clientIds: [...new Set(missing.map((t) => t.clientId))], since: prev.from }).catch(() => {});
    syncing = true;
  }

  const items: Item[] = rows.map((r) => ({
    externalId: r.externalId,
    clientId: r.clientId,
    platform: r.platform as Item["platform"],
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
  // every client with a link shows, even in a week they posted nothing
  const summaries = [
    ...o.clients,
    ...clientIds
      .filter((cid) => !o.clients.some((c) => c.clientId === cid))
      .map((cid) => ({ clientId: cid, posts: 0, views: 0, previousViews: 0, youtube: { posts: 0, views: 0 }, instagram: { posts: 0, views: 0 }, top: null })),
  ];
  const lastRead = accounts.reduce<Date | null>((m, a) => (a.scrapedAt && (!m || a.scrapedAt > m) ? a.scrapedAt : m), null);
  const isLastWeek = from === lastWeek(today).from && to === lastWeek(today).to;
  const peak = Math.max(1, ...o.series.map((d) => d.youtube + d.instagram));
  const icon = (p: string, size = 13) => (p === "youtube" ? <YoutubeIcon size={size} /> : <InstagramIcon size={size} />);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {isLastWeek ? "Last week" : "From"} · {short(from)} – {short(to)} {to.slice(0, 4) !== today.slice(0, 4) && to.slice(0, 4)} ·
            every client&apos;s YouTube and Instagram
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls from={from} to={to} today={today} />
          <RefreshButton from={from} to={to} syncing={syncing} updated={lastRead ? ago(lastRead) : null} />
        </div>
      </div>

      {clientIds.length === 0 ? (
        <p className="card-surface rounded-2xl px-6 py-12 text-center text-sm text-muted shadow-sm">
          No client has a YouTube channel or Instagram handle set yet — add them on each client&apos;s Analytics tab.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Views pulled", value: count(o.views), change: <Change now={o.views} before={o.previousViews} />, sub: `vs ${count(o.previousViews)} the period before` },
              { label: "Posts published", value: count(o.posts), change: <Change now={o.posts} before={o.previousPosts} />, sub: `vs ${o.previousPosts} the period before` },
              { label: "YouTube views", value: count(o.youtube.views), sub: `${o.youtube.posts} video${o.youtube.posts === 1 ? "" : "s"}`, icon: "youtube" },
              { label: "Instagram views", value: count(o.instagram.views), sub: `${o.instagram.posts} post${o.instagram.posts === 1 ? "" : "s"}`, icon: "instagram" },
            ].map((t) => (
              <div key={t.label} className="card-surface flex flex-col gap-1 rounded-2xl px-5 py-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  {t.icon && icon(t.icon, 12)} {t.label}
                </p>
                <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                  {t.value} {t.change}
                </p>
                <p className="text-xs text-muted">{t.sub}</p>
              </div>
            ))}
          </div>

          {/* views by the day each post went up, YouTube and Instagram stacked */}
          <section className="card-surface rounded-2xl p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Views, by the day each post went up</p>
              <p className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-sky-400" /> YouTube
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-violet-400" /> Instagram
                </span>
              </p>
            </div>
            <div className="flex h-36 items-end gap-1">
              {o.series.map((d) => (
                <div
                  key={d.day}
                  title={`${short(d.day)} — ${count(d.youtube + d.instagram)} views`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div className="rounded-t-sm bg-violet-400/80" style={{ height: `${(d.instagram / peak) * 100}%` }} />
                  <div className={`bg-sky-400/80 ${d.instagram ? "" : "rounded-t-sm"}`} style={{ height: `${(d.youtube / peak) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>{short(from)}</span>
              <span>peak {count(peak)}</span>
              <span>{short(to)}</span>
            </div>
          </section>

          {/* each client, best first */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">By client</h2>
            <div className="card-surface overflow-hidden rounded-2xl shadow-sm">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_5rem_7rem_7rem_7rem_minmax(0,1.6fr)] gap-4 px-5 py-2 text-xs text-muted md:grid">
                <span>Client</span>
                <span className="text-right">Posts</span>
                <span className="text-right">YouTube</span>
                <span className="text-right">Instagram</span>
                <span className="text-right">Views</span>
                <span>Best post</span>
              </div>
              {summaries.map((s) => {
                const c = client(s.clientId);
                if (!c) return null;
                const logo = clientLogoSrc(c);
                return (
                  <Link
                    key={s.clientId}
                    href={`${clientHref(c)}?tab=analytics`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-border/50 px-5 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,1.4fr)_5rem_7rem_7rem_7rem_minmax(0,1.6fr)]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
                        <img src={logo} alt="" className="photo h-7 w-7" />
                      ) : (
                        <Avatar name={c.name} size={28} presence={false} />
                      )}
                      <span className="truncate text-sm font-medium">{c.name}</span>
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-muted md:block">{s.posts}</span>
                    <span className="hidden text-right text-sm tabular-nums text-muted md:block">{s.youtube.posts ? count(s.youtube.views) : "—"}</span>
                    <span className="hidden text-right text-sm tabular-nums text-muted md:block">{s.instagram.posts ? count(s.instagram.views) : "—"}</span>
                    <span className="flex items-center justify-end gap-2 text-sm font-semibold tabular-nums">
                      {count(s.views)} <Change now={s.views} before={s.previousViews} />
                    </span>
                    <span className="col-span-2 flex min-w-0 items-center gap-2 text-xs text-muted md:col-span-1">
                      {s.top ? (
                        <>
                          {icon(s.top.platform, 12)}
                          <span className="truncate">{s.top.title}</span>
                          <span className="shrink-0 tabular-nums text-foreground/80">{count(s.top.views ?? 0)}</span>
                        </>
                      ) : (
                        "Nothing published"
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* what carried it, across everyone */}
          {o.top.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Top posts</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {o.top.map((i) => (
                  <a
                    key={`${i.platform}-${i.externalId}`}
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-surface card-interactive flex flex-col overflow-hidden rounded-xl shadow-sm"
                  >
                    <span className={`relative block w-full overflow-hidden bg-surface-2 ${i.platform === "youtube" && i.kind === "Video" ? "aspect-video" : "aspect-[4/5]"}`}>
                      {i.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
                        <img src={i.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">
                        {icon(i.platform, 11)} {i.kind}
                      </span>
                    </span>
                    <span className="flex flex-col gap-0.5 px-3 py-2.5">
                      <span className="text-base font-semibold tabular-nums">{count(i.views ?? 0)} views</span>
                      <span className="truncate text-xs text-muted">{client(i.clientId)?.name} · {short(i.published)}</span>
                      <span className="truncate text-xs text-foreground/80">{i.title}</span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <p className="text-xs text-muted">
            Views so far on what was published in the range, from each account&apos;s public page. Refreshed every night —
            recent posts daily, older ones weekly — so opening this never waits on a scrape.
            {syncing && " Reading the latest now; this page updates when it's done."}
          </p>
        </>
      )}
    </div>
  );
}
