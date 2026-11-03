import { Magnet, Percent, Reply, Send, Users } from "lucide-react";
import { after } from "next/server";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { noticeOf } from "../home/notices";
import { SalesNotices } from "./SalesNotices";
import { ReachOuts } from "./ReachOuts";
import { prisma } from "@/lib/prisma";
import { dayOf as dayIn } from "@/lib/editorKpi";
import { DEAD_STAGE } from "@/lib/leadSheet";
import { dayOf, isReplied, markAny, MARKED, PLATFORM_NAME, type LeadData, type Platform } from "@/lib/space";
import { StatTile } from "../StatTile";
import { loadBoard } from "./space/data";

// a glimpse of each day on Ongoing reach outs: its five latest (Abhishek, 3 Nov 2026)
const SHOWN = 5;
const at = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// Sales' home (Abhishek, 3 Nov 2026): what's going on in outreach at a
// glance. Its numbers (leads collected on Leads, leads in outreach, today's
// reach outs, replies), every outreach board as a table by day (ReachOuts),
// and the latest replies, each leading to its board or lead.

// A lead reached out to: it has been on a day of the sequence, or emailed
// from the sales inbox. Replied: it's on a Replied stage, or wrote back
// (an email reply, or one marked on Instagram or LinkedIn): as the boards
// show it, whoever moved it there.
const reachedOut = (l: LeadData) => l.reachOuts.first != null || l.reachedOn.length > 0;
const wroteBack = (l: LeadData) => !!l.email.replied || MARKED.some((p) => !!markAny(l.marks, p, "replied"));
// `notices`: Sales alone, whose notices would otherwise have nowhere to show
// (marked seen only when it's really them, not Level 1 looking as them)
export async function SalesHome({ teamId, team, notices }: { teamId: string; team: string; notices?: { forId: string; real: boolean; canForward: boolean } }) {
  const spaces = await prisma.space.findMany({
    where: { teamId, kind: "board", parent: { leadBank: false } },
    orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, parent: { select: { name: true, slug: true, parent: { select: { slug: true } } } } },
  });
  // today from midnight in India
  const today = new Date(`${dayIn(new Date())}T00:00:00+05:30`);
  const [boards, collected, moves, mine, people] = await Promise.all([
    Promise.all(spaces.map((s) => loadBoard(s.id))),
    prisma.lead.count({ where: { board: { teamId, parent: { leadBank: true } }, stage: { name: { not: DEAD_STAGE } } } }),
    prisma.leadEvent.findMany({ where: { kind: "moved", createdAt: { gte: today }, toStage: { startsWith: "Day " }, lead: { board: { teamId, parent: { leadBank: false } } } }, select: { fromStage: true, toStage: true } }),
    notices ? prisma.notice.findMany({ where: { forId: notices.forId }, orderBy: { createdAt: "desc" }, take: 40 }) : [],
    notices?.canForward ? prisma.user.findMany({ where: { employment: "active", id: { not: notices.forId } }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  // on screen now: seen, but marked new this once, as Home does
  const fresh = new Set(mine.filter((n) => !n.readAt).map((n) => n.id));
  if (fresh.size && notices?.real) {
    const seen = [...fresh];
    after(() => prisma.notice.updateMany({ where: { id: { in: seen } }, data: { readAt: new Date() } }).catch(() => {}));
  }
  // a task it's about opens in My tasks (there's no task window here)
  const shownNotices = mine.map((n) => ({ ...noticeOf(n, fresh.has(n.id)), ...(n.taskId || n.workTaskId ? { open: undefined, href: "/my-tasks" } : {}) }));
  // a reach out today: into a day of the sequence from before it, or on to a later day
  const reachedToday = moves.filter((m) => {
    const to = dayOf(m.toStage ?? "");
    const from = m.fromStage ? dayOf(m.fromStage) : null;
    return to != null && (from == null || to > from);
  }).length;

  const rows = spaces.flatMap((s, i) => {
    const board = boards[i];
    if (!board) return [];
    const path = [s.parent?.parent?.slug, s.parent?.slug].filter(Boolean).join("/");
    const href = `/org/${team}/${path}?board=${board.slug}`;
    // in outreach: on a day of the sequence
    const active = new Set(board.stages.filter((st) => dayOf(st.name) != null).map((st) => st.id));
    // the sequence by day, Day 1 to the last; on each, its leads, the
    // latest to arrive first
    const column = (stage: (typeof board.stages)[number]) => {
      const here = board.leads.filter((l) => l.stageId === stage.id).sort((a, b) => Date.parse(b.stageSince) - Date.parse(a.stageSince));
      return { stage, count: here.length, leads: here.slice(0, SHOWN) };
    };
    // only the days (Abhishek, 3 Nov 2026)
    const columns = board.stages.flatMap((st) => {
      const d = dayOf(st.name);
      return d != null ? [column(st)] : [];
    });
    const repliedStages = new Set(board.stages.filter((st) => isReplied(st.name)).map((st) => st.id));
    return [
      {
        id: board.id,
        name: board.name,
        portal: s.parent?.name ?? "",
        href,
        leads: board.leads,
        fields: board.fields,
        stages: board.stages,
        columns,
        inOutreach: board.leads.filter((l) => active.has(l.stageId)).length,
        reached: board.leads.filter(reachedOut).length,
        replied: board.leads.filter((l) => repliedStages.has(l.stageId) || wroteBack(l)).length,
      },
    ];
  });
  const reached = rows.reduce((n, r) => n + r.reached, 0);
  const replied = rows.reduce((n, r) => n + r.replied, 0);

  // who wrote back, newest first: an email reply, or one marked on Instagram or LinkedIn
  const replies = rows
    .flatMap((r) =>
      r.leads.flatMap((l: LeadData) => [
        ...(l.email.replied ? [{ lead: l, platform: "email" as Platform, at: l.email.replied.at }] : []),
        ...MARKED.flatMap((p) => {
          const m = markAny(l.marks, p, "replied");
          return m ? [{ lead: l, platform: p as Platform, at: m.at }] : [];
        }),
      ].map((x) => ({ ...x, board: r.name, href: `${r.href}&lead=${x.lead.id}` }))),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Leads collected" value={collected} Icon={Magnet} />
        <StatTile label="In outreach" value={rows.reduce((n, r) => n + r.inOutreach, 0)} Icon={Users} />
        <StatTile label="Reach outs today" value={reachedToday} Icon={Send} />
        <StatTile label="Replies" value={replied} tone="emerald" Icon={Reply} />
        <StatTile label="Reply rate" value={reached ? `${Math.round((replied / reached) * 100)}%` : "–"} lit={replied > 0} tone="emerald" Icon={Percent} note={<p className="text-xs text-muted">{replied} of {reached} reached out to</p>} />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <ReachOuts boards={rows.filter((r) => r.inOutreach > 0).map((r) => ({ id: r.id, portal: r.portal, name: r.name, href: r.href, fields: r.fields, stages: r.stages, columns: r.columns }))} />

        <div className="flex flex-col gap-4">
        {notices && <SalesNotices notices={shownNotices} canForward={notices.canForward} people={people} />}
        <section className="panel rounded-2xl">
          <h2 className="px-5 pt-4 pb-2 text-sm font-semibold tracking-tight">Latest replies</h2>
          {replies.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">No replies yet.</p>
          ) : (
            <ul className="px-2 pb-2">
              {replies.map((r, i) => (
                <li key={`${r.lead.id}:${r.platform}:${i}`}>
                  <Link href={r.href} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.lead.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {PLATFORM_NAME[r.platform]} · {r.board}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{at.format(new Date(r.at))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </>
  );
}
