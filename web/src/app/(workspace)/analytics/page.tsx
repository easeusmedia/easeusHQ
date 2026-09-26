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

// One of the week's best: where it ranks, its picture, and its views
function Top({ item, rank, tall, client }: { item: Item; rank: number; tall: boolean; client: string }) {
  const facts = (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">{count(item.views ?? 0)}</span>
        <span className="text-xs text-muted">views</span>
      </span>
      <span className="line-clamp-2 text-sm leading-snug text-foreground/90">{item.title}</span>
      <span className="truncate text-xs text-muted">
        {client} · {short(item.published)}
      </span>
    </span>
  );
  const picture = (
    <span className={`relative block shrink-0 overflow-hidden rounded-xl bg-surface-2 ${tall ? "aspect-[9/16] w-24" : "aspect-video w-full"}`}>
      {item.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element -- the platform's own thumbnail
        <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      )}
      <span className="absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-full bg-black/60 px-1.5 text-xs font-medium text-white backdrop-blur">
        {rank}
      </span>
    </span>
  );
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className={`card-surface card-interactive group flex gap-4 rounded-2xl p-3 shadow-sm ${tall ? "items-center" : "flex-col"}`}
    >
      {picture}
      {facts}
    </a>
  );
}

// A row of the week's best of one kind — long-form, Shorts or Reels —
// across the full width
function TopRow({ title, items, tall, clientName }: { title: string; items: Item[]; tall: boolean; clientName: (id: string) => string }) {
  const best = [...items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 4);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-medium">Top {title}</span>
        <span className="text-muted">
          of {items.length} · {count(views(items))} views
        </span>
      </p>
      {best.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {best.map((i, n) => (
            <Top key={i.externalId} item={i} rank={n + 1} tall={tall} client={clientName(i.clientId)} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-surface/40 px-4 py-8 text-center text-sm text-muted">None in this range</p>
      )}
    </div>
  );
}

// Every client's content at once, one platform at a time (YouTube or
// Instagram) — by default the last two weeks, Monday to Sunday. Deliberately little:
// how many views our work pulled and how that moved, the week's top four
// (long-form and Shorts in rows of their own), and which clients it came
// from. Only our work counts (lib/ourWork.ts). Straight from what's stored
// (lib/contentSync.ts), refreshed every night.
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
  // the last two whole weeks, Monday to Sunday, unless asked otherwise
  const { from, to } = valid ? { from: q.from!, to: q.to! } : lastWeek(today, 2);
  const prev = previousRange(from, to);
  const platform: Platform = q.platform === "instagram" ? "instagram" : "youtube";
  const href = (p: Platform) => `/analytics?platform=${p}&from=${from}&to=${to}`;

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
  const isLastTwo = from === lastWeek(today, 2).from && to === lastWeek(today, 2).to;
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

  const { ids, now, before, review, byClient } = section(platform);
  const yt = platform === "youtube";
  const longForm = now.filter((i) => i.kind === "Video");
  const shorts = now.filter((i) => i.kind === "Short");
  const reels = now.filter((i) => i.kind === "Reel" || i.kind === "Video");
  const total = views(now);
  const top = Math.max(1, ...byClient.map((c) => c.views));
  const stats = yt
    ? [
        ["Videos", now.length],
        ["Long-form", longForm.length],
        ["Shorts", shorts.length],
        ["Avg views", now.length ? count(total / now.length) : "—"],
      ]
    : [
        ["Posts", now.length],
        ["Reels", reels.length],
        ["Avg views per reel", reels.length ? count(views(reels) / reels.length) : "—"],
        ["Likes and comments", count(now.reduce((n, i) => n + (i.likes ?? 0) + (i.comments ?? 0), 0))],
      ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-0.5 text-sm text-muted">
              {isLastTwo ? "Last 2 weeks" : isLastWeek ? "Last week" : "Showing"} · {short(from)} – {short(to)}
            </p>
          </div>
          {/* one platform at a time */}
          <div className="flex gap-1 rounded-xl border border-border bg-surface/60 p-1">
            {(["youtube", "instagram"] as const).map((p) => {
              const Icon = p === "youtube" ? YoutubeIcon : InstagramIcon;
              return (
                <Link
                  key={p}
                  href={href(p)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                    platform === p ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={15} /> {p === "youtube" ? "YouTube" : "Instagram"}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls from={from} to={to} today={today} platform={platform} />
          <RefreshButton from={from} to={to} syncing={syncing} updated={lastRead ? ago(lastRead) : null} />
        </div>
      </div>

      {!ids.length ? (
        <p className="card-surface rounded-2xl px-6 py-12 text-center text-sm text-muted shadow-sm">
          No client has {yt ? "a YouTube channel" : "an Instagram handle"} set yet — add it on each client&apos;s Analytics tab.
        </p>
      ) : (
        <div key={platform} className="fade-in flex flex-col gap-8">
          {/* the headline, across the full width */}
          <div className="card-surface flex flex-wrap items-center gap-x-14 gap-y-5 rounded-2xl px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">Views pulled</p>
              <p className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">{count(total)}</span>
                <Change now={total} before={views(before)} label={isLastTwo ? "vs the 2 weeks before" : isLastWeek ? "vs the week before" : "vs the period before"} />
              </p>
            </div>
            {stats.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <p className="text-xs text-muted">{label}</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
              </div>
            ))}
            {review > 0 && (
              <p className="ml-auto max-w-56 text-xs text-amber-300">
                {plural(review, "post")} not yet marked ours — left out until someone does
              </p>
            )}
          </div>

          {/* the week's best — long-form and Shorts in rows of their own */}
          {yt ? (
            <>
              <TopRow title="long-form" items={longForm} tall={false} clientName={clientName} />
              <TopRow title="Shorts" items={shorts} tall clientName={clientName} />
            </>
          ) : (
            <TopRow title="reels" items={reels} tall clientName={clientName} />
          )}

          {/* where it came from */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">By client</p>
            <div className="card-surface overflow-hidden rounded-2xl shadow-sm">
              {byClient.map((c) => {
                const cl = clients.find((x) => x.id === c.cid);
                if (!cl) return null;
                const logo = clientLogoSrc(cl);
                return (
                  <Link
                    key={c.cid}
                    href={`${clientHref(cl)}?tab=analytics`}
                    className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem_5rem_6rem] items-center gap-5 px-5 py-3 transition-colors not-first:border-t not-first:border-border/50 hover:bg-surface-2/50"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a small stored logo
                        <img src={logo} alt="" className="photo h-7 w-7" />
                      ) : (
                        <Avatar name={cl.name} size={28} presence={false} />
                      )}
                      <span className="truncate text-sm font-medium">{cl.name}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.05]">
                      <span
                        className={`block h-full rounded-full ${yt ? "bg-sky-400/70" : "bg-violet-400/70"}`}
                        style={{ width: `${c.views ? Math.max(2, (c.views / top) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="text-right text-xs text-muted">{plural(c.posts, yt ? "video" : "post")}</span>
                    <span className="text-right text-sm font-semibold tabular-nums">{count(c.views)}</span>
                    <span className="text-right">
                      <Change now={c.views} before={c.before} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted">
            Only what we made — matched to our tasks, marked ours, or on channels we run. Views so far, refreshed every night.
            {syncing && " Reading the latest now; this page updates when it's done."}
          </p>
        </div>
      )}
    </div>
  );
}
