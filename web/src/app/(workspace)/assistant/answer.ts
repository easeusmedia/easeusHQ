import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { aiSpend, callClaude, HAIKU, OverBudget, SONNET, type Block, type Message } from "@/lib/ai";
import { clipText, compressHistory, mentioned, needsDeepModel, TOPICS, type Turn } from "@/lib/assistant";
import { TOOLS, runTool, personSummary, clientSummary, overviewOf, performanceOf, feedbackOf } from "./tools";
import { prepare, type Proposal } from "./proposals";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";

// The admin's assistant: one question in, one short answer out, as cheaply
// as a useful answer allows (lib/assistant.ts has the thinking behind it).
//
// Order of work, cheapest first: look up what the question names before
// Claude sees it, so most questions are answered in a single call; send
// the conversation compressed; use Haiku unless the question needs real
// analysis; cap the tool round trips and the answer's length.

export type AskResult = {
  text?: string;
  proposals?: Proposal[];
  model?: string;
  cost?: number;
  spent?: number;
  budget?: number;
  error?: string;
};

const MAX_STEPS = 4;

// The team and clients by name: cheap, and it spares a tool call whenever a
// question names someone.
async function roster() {
  const [people, clients] = await Promise.all([
    prisma.user.findMany({ where: { employment: { not: "former" } }, include: { team: true, jobTitle: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { status: { not: "previous" } }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }),
  ]);
  return { people, clients };
}

function system(me: string, r: Awaited<ReturnType<typeof roster>>) {
  const now = new Date();
  const day = indiaDay(now);
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Kolkata" });
  return `You are Nyra, the admin's personal assistant inside Easeus HQ, the operations dashboard of Easeus Media, a video agency. The admin is ${me}.
You're warm, kind and genuinely caring, with a quick, playful wit: you look out for the admin and for everyone on the team, and it shows in how you speak about people, always supportive and never harsh, with a way to help rather than blame. A light, witty touch is welcome when it fits; the joke is never on a teammate. You notice and appreciate good work, and say so: open with what's going well, then what needs attention. You're a natural problem solver and a wonderful project manager who handles everything with ease: lead with what matters, gently flag what's late or at risk, and offer a practical way through, one or two concrete options. Sound like a thoughtful person, not a report, and keep it short.
When someone is behind, say it gently, as a caring colleague would ("Narendra has a lot on his plate; a quick check-in could help him"), never with labels like "critically low", and don't bring up anyone's score unless asked.
Be exact: give stages, dates and numbers precisely as the data states them, and never guess at causes the data doesn't show; ask or suggest instead.
Work only with this dashboard's data: the <data> sent with a question, and your tools. Never use outside knowledge or guess; if the data doesn't have it, say so. For anything unrelated to Easeus HQ, say in one sentence that you only help with the dashboard.
Answer briefly in plain, professional English (no em dashes): the answer first, then only the details that matter, as a short list or table. Use names and titles in answers, never refs.
Use as few tool calls as you can. To change anything, call propose straight away, with the task's title or ref (or the person's name) as ref: nothing changes until the admin confirms in the panel, so tell them what you proposed.
Today is ${weekday} ${day} (India); this month is ${day.slice(0, 7)}.
Team: ${r.people.map((p) => `${p.name} (${[p.jobTitle?.name, displayTeam(p)?.name].filter(Boolean).join(", ") || p.role})`).join("; ")}
Clients: ${r.clients.map((c) => c.name + (c.status === "current" ? "" : ` (${c.status})`)).join("; ")}`;
}

// Open tasks whose title (or the part after "Client - ") is in the question
async function namedTasks(q: string): Promise<string> {
  const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const question = norm(q);
  const [tasks, work] = await Promise.all([
    prisma.task.findMany({ where: LIVE_TASK, select: { id: true, title: true, status: true, assignedTo: { select: { name: true } } } }),
    prisma.workTask.findMany({ where: LIVE_WORK_TASK, select: { id: true, title: true, status: true, assignedTo: { select: { name: true } } } }),
  ]);
  const named = [...tasks.map((t) => ({ ...t, label: STAGE[t.status].label })), ...work.map((t) => ({ ...t, label: WORK_TASK_STAGE[t.status].label }))].filter((t) => {
    const full = norm(t.title);
    const tail = norm(t.title.split(/\s[-–]\s/).slice(1).join(" "));
    return (full.length > 6 && question.includes(full)) || (tail.length > 6 && question.includes(tail));
  });
  return named.length ? `Tasks named in the question:\n${named.slice(0, 3).map((t) => `${t.id.slice(0, 8)} · ${t.title} · ${t.assignedTo?.name ?? "unassigned"} · ${t.label}`).join("\n")}` : "";
}

// What the question names, looked up before Claude is asked
async function lookAhead(q: string, r: Awaited<ReturnType<typeof roster>>): Promise<string> {
  const people = mentioned(q, r.people).slice(0, 2);
  const clients = mentioned(q, r.clients).slice(0, 1);
  const topics = new Set(TOPICS.filter((t) => t.test.test(q)).map((t) => t.key));
  const parts: Promise<string>[] = [
    ...people.map((p) => personSummary({ who: p.id })),
    ...clients.map((c) => clientSummary({ who: c.id })),
  ];
  // someone's record already carries this month's numbers; the log itself
  // only when the question is about mistakes or feedback
  if (topics.has("performance")) {
    if (!people.length) parts.push(performanceOf({}));
    if (/\b(mistakes?|feedback|comments?)\b/i.test(q)) for (const p of people) parts.push(feedbackOf({ person: p.id }));
  }
  if (topics.has("workload") && !people.length) parts.push(overviewOf({ topic: "workload" }));
  // "what needs my attention", "what's overdue": the list itself, so it's
  // answered in one call instead of a second one to fetch it
  if (/\b(attention|overdue|late|priorit\w*|at risk|today|urgent)\b/i.test(q) && !people.length) parts.push(runTool("tasks", { state: "overdue" }));
  // open tasks named in the question, so a change can be proposed at once
  parts.push(namedTasks(q));
  if (topics.has("finance")) parts.push(overviewOf({ topic: "finance" }));
  if (topics.has("contracts")) parts.push(overviewOf({ topic: "contracts" }));
  const found = await Promise.all(parts.map((p) => p.catch(() => "")));
  return clipText(found.filter(Boolean).join("\n\n"), 5000);
}

// For whoever the caller has already checked is the admin.
export async function answer(me: { id: string; name: string }, history: Turn[], question: string): Promise<AskResult> {
  const q = question.trim().slice(0, 2000);
  if (!q) return { error: "Ask something." };

  try {
    const r = await roster();
    const model = needsDeepModel(q) ? SONNET : HAIKU;
    const [data, { earlier, recent }] = [await lookAhead(q, r), compressHistory(history.filter((t) => t.text?.trim()))];

    const messages: Message[] = recent.map((t) => ({ role: t.role, content: t.text }));
    messages.push({
      role: "user",
      content: `${earlier ? `Earlier in this chat:\n${earlier}\n\n` : ""}${data ? `<data>\n${data}\n</data>\n\n` : ""}${q}`,
    });

    const proposals: Proposal[] = [];
    let cost = 0;
    let text = "";
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await callClaude({
        feature: "assistant",
        model,
        system: system(me.name, r),
        messages,
        tools: TOOLS,
        toolChoice: step === MAX_STEPS - 1 ? "none" : undefined,
        maxTokens: model === HAIKU ? 700 : 1000,
        effort: "low",
        userId: me.id,
      });
      cost += res.cost;
      text = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (res.stop_reason !== "tool_use") break;

      const calls = res.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      const results: Block[] = await Promise.all(
        calls.map(async (c) => {
          if (c.name !== "propose") return { type: "tool_result" as const, tool_use_id: c.id, content: await runTool(c.name, c.input) };
          const p = await prepare(c.input as never);
          if (typeof p === "string") return { type: "tool_result" as const, tool_use_id: c.id, content: p, is_error: true };
          proposals.push(p);
          return {
            type: "tool_result" as const,
            tool_use_id: c.id,
            content: `Shown to the admin to confirm: ${p.title}: ${p.lines.map((l) => `${l.field} ${l.from ? `${l.from} → ` : ""}${l.to}`).join("; ")}`,
          };
        })
      );
      // a step that only proposed changes needs no further word from Claude:
      // the panel shows each one, before and after, to confirm
      if (calls.every((c) => c.name === "propose") && results.every((r) => r.type === "tool_result" && !r.is_error)) break;
      messages.push({ role: "assistant", content: res.content }, { role: "user", content: results });
    }

    const { spent, budget } = await aiSpend();
    return { text: text || (proposals.length ? "Here's the change for you to confirm." : "I couldn't find an answer to that."), proposals, model, cost, spent, budget };
  } catch (err) {
    if (err instanceof OverBudget) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Claude couldn't be reached." };
  }
}

