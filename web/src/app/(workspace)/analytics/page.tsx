import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { clientLogoSrc } from "@/lib/photos";
import { clientHref } from "@/lib/slug";
import { istDay, lastWeek, previousRange, shiftDay, type Item, type Platform } from "@/lib/analytics";
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
const count = (n: number) => (n < 1_000 ? Math.round(n).toString() : compact(n));
const views = (list: Item[]) => list.reduce((n, i) => n + (i.views ?? 0), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ago(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Change({ now, before, label }: { now: number; before: number; label?: string }) {
  if (!before) return null;
  const c = (now - before) / before;
  const Icon = c >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${c >= 0 ? "text-emerald-300" : "text-red-300"}`}>
      <Icon size={14} />
      {Math.abs(c) >= 1 ? `${(c + 1).toFixed(1)}×` : `${Math.abs(c * 100).toFixed(0)}%`}
      {label && <span className="ml-1 font-normal text-muted">{label}</span>}
    </span>
  );
}

// A piece of content as its picture, with the one number that matters on it
function Card({ item, tall, client }: { item: Item; tall: boolean; client: string }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${item.title} — ${client}, ${short(item.published)}`}
      className={`group relative block overflow-hidden rounded-xl bg-surface-2 ${tall ? "aspect-[9/16]" : "aspect-video"}`}
    >
      {item.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
        <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-2.5">
        <span className="text-lg font-semibold leading-none tabular-nums text-white">{count(item.views ?? 0)}</span>
        <span className="truncate text-xs text-white/70">{client}</span>
      </span>
    </a>
  );
}

// One kind of content — long-form, Shorts, Reels — with its own count and its best
function Group({
  title,
  items,
  tall,
  show,
  clientName,
}: {
  title: string;
  items: Item[];
  tall: boolean;
  show: number;
  clientName: (id: string) => string;
}) {
  const best = [...items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, show);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted">
          {items.length} · {count(views(items))} views
        </span>
      </p>
      {best.length ? (
        <div className={`grid gap-2.5 ${tall ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2"}`}>
          {best.map((i) => (
            <Card key={i.externalId} item={i} tall={tall} client={clientName(i.clientId)} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-surface/40 px-4 py-8 text-center text-xs text-muted">None in this range</p>
      )}
    </div>
  );
}

// Every client's content at once — YouTube, then Instagram — by default last
// week, Monday to Sunday. Deliberately little per section: how many views our
// work pulled and how that moved, the best of it (long-form and Shorts kept
// apart), and which clients it came from. Only our work counts
// (lib/ourWork.ts). Straight from what's stored (lib/contentSync.ts),
// refreshed every night.
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

  const lastRead = accounts.reduce<Date | null>((m, a) => (a.scrapedAt && (!m || a.scrapedAt > m) ? a.scrapedAt : m), null);
  const isLastWeek = from === lastWeek(today).from && to === lastWeek(today).to;
  const clientName = (cid: string) => clients.find((c) => c.id === cid)?.name ?? "";

  // one platform: our work in the range and the period before, and what's
  // still waiting to be called ours or not
  const section = (platform: Platform) => {
    const allOurs = (clientId: string) =>
      accounts.find((a) => a.clientId === clientId && a.platform === platform)?.allOurs ?? platform === "youtube";
    const mine = rows.filter((r) => r.platform === platform);
    const toItem = (r: (typeof rows)[number]): Item => ({
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
    });
    const ours = mine.filter((r) => counts(r.ours, allOurs(r.clientId))).map(toItem);
    const now = ours.filter((i) => i.published >= from && i.published <= to);
    const before = ours.filter((i) => i.published >= prev.from && i.published <= prev.to);
    const review = mine.filter((r) => {
      const day = istDay(r.publishedAt);
      return r.ours === null && !allOurs(r.clientId) && day >= from && day <= to;
    }).length;
    const ids = [...new Set(all.filter((t) => t.platform === platform).map((t) => t.clientId))];
    const byClient = ids
      .map((cid) => ({
        cid,
        views: views(now.filter((i) => i.clientId === cid)),
        before: views(before.filter((i) => i.clientId === cid)),
        posts: now.filter((i) => i.clientId === cid).length,
      }))
      .sort((a, b) => b.views - a.views);
    return { ids, now, before, review, byClient };
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {isLastWeek ? "Last week" : "Showing"} · {short(from)} – {short(to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls from={from} to={to} today={today} />
          <RefreshButton from={from} to={to} syncing={syncing} updated={lastRead ? ago(lastRead) : null} />
        </div>
      </div>

      {clientIds.length === 0 && (
        <p className="card-surface rounded-2xl px-6 py-12 text-center text-sm text-muted shadow-sm">
          No client has a YouTube channel or Instagram handle set yet — add them on each client&apos;s Analytics tab.
        </p>
      )}

      {(["youtube", "instagram"] as const).map((platform) => {
        const { ids, now, before, review, byClient } = section(platform);
        if (!ids.length) return null;
        const yt = platform === "youtube";
        const Icon = yt ? YoutubeIcon : InstagramIcon;
        const longForm = now.filter((i) => i.kind === "Video");
        const shorts = now.filter((i) => i.kind === "Short");
        const reels = now.filter((i) => i.kind === "Reel" || i.kind === "Video");
        const total = views(now);
        const top = Math.max(1, ...byClient.map((c) => c.views));
        return (
          <section key={platform} className="flex flex-col gap-6">
            {/* the headline: what our work pulled, and how that moved */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Icon size={16} /> {yt ? "YouTube" : "Instagram"}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">{count(total)}</span>
                  <span className="text-sm text-muted">views</span>
                  <Change now={total} before={views(before)} label={isLastWeek ? "vs the week before" : "vs the period before"} />
                </p>
                <p className="text-sm text-muted">
                  {yt
                    ? `${plural(now.length, "video")} · ${longForm.length} long-form · ${plural(shorts.length, "Short")}`
                    : `${plural(now.length, "post")} · ${plural(reels.length, "reel")}`}
                </p>
              </div>
              {review > 0 && (
                <p className="text-xs text-amber-300">
                  {plural(review, "post")} not yet marked ours — left out until someone does
                </p>
              )}
            </div>

            {/* the best of it, long-form and Shorts never in one row */}
            {yt ? (
              <div className="grid gap-8 lg:grid-cols-2">
                <Group title="Long-form" items={longForm} tall={false} show={4} clientName={clientName} />
                <Group title="Shorts" items={shorts} tall show={4} clientName={clientName} />
              </div>
            ) : (
              <Group title="Reels" items={reels} tall show={8} clientName={clientName} />
            )}

            {/* where it came from */}
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-sm font-medium">By client</p>
              {byClient.map((c) => {
                const cl = clients.find((x) => x.id === c.cid);
                if (!cl) return null;
                const logo = clientLogoSrc(cl);
                return (
                  <Link
                    key={c.cid}
                    href={`${clientHref(cl)}?tab=analytics`}
                    className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2/50"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
                        <img src={logo} alt="" className="photo h-6 w-6" />
                      ) : (
                        <Avatar name={cl.name} size={24} presence={false} />
                      )}
                      <span className="truncate text-sm">{cl.name}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.05]">
                      <span
                        className={`block h-full rounded-full ${yt ? "bg-sky-400/70" : "bg-violet-400/70"}`}
                        style={{ width: `${c.views ? Math.max(2, (c.views / top) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="flex w-40 items-center justify-end gap-2 text-sm">
                      <span className="text-xs text-muted">{plural(c.posts, yt ? "video" : "post")}</span>
                      <span className="w-12 text-right font-medium tabular-nums">{count(c.views)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {clientIds.length > 0 && (
        <p className="text-xs text-muted">
          Only what we made — matched to our tasks, marked ours, or on channels we run. Views so far, refreshed every night.
          {syncing && " Reading the latest now; this page updates when it's done."}
        </p>
      )}
    </div>
  );
}
