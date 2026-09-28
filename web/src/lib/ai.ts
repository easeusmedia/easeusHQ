import { prisma } from "./prisma";

// Every call to Claude goes through here, so each one is metered and none
// is made once the month's allowance is spent.
//
// The allowance is small ($5 a month by default, AI_BUDGET below), so the
// rule everywhere is: Haiku unless there's a reason, the fewest tokens that
// answer the question, and nothing sent twice that needn't be.

export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-5";
export const OPUS = "claude-opus-5";

// US$ per million tokens: input, output. Cache writes cost 1.25× input,
// cache reads 0.1×.
const PRICE: Record<string, [number, number]> = {
  [HAIKU]: [1, 5],
  [SONNET]: [2, 10],
  [OPUS]: [5, 25],
};

export const CLAUDE_SETTINGS = { key: "anthropic.apiKey" } as const;

// The key is kept in the app's settings (Integrations → Claude), so it can
// be changed without a redeploy; ANTHROPIC_API_KEY works too.
export async function claudeKey(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: CLAUDE_SETTINGS.key } });
  return row?.value ?? process.env.ANTHROPIC_API_KEY ?? null;
}

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string };
export type Message = { role: "user" | "assistant"; content: string | Block[] };
export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export const AI_BUDGET = "ai.monthlyBudget";
const DEFAULT_BUDGET = 5;

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

export function costOf(model: string, u: Usage): number {
  const [inp, out] = PRICE[model] ?? PRICE[OPUS];
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * inp + write * inp * 1.25 + read * inp * 0.1 + u.output_tokens * out) / 1_000_000;
}

// Anthropic's billing month is a calendar month in UTC
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

export async function aiSpend(): Promise<{ spent: number; budget: number }> {
  const [sum, row] = await Promise.all([
    prisma.aiUsage.aggregate({ where: { at: { gte: monthStart() } }, _sum: { costUsd: true } }),
    prisma.appSetting.findUnique({ where: { key: AI_BUDGET } }),
  ]);
  const budget = Number(row?.value);
  return { spent: sum._sum.costUsd ?? 0, budget: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET };
}

export class OverBudget extends Error {}

export type CallInput = {
  feature: "assistant" | "frameio" | "contracts";
  model: string;
  system: string | { type: "text"; text: string }[];
  messages: Message[];
  tools?: Tool[];
  maxTokens: number;
  // Sonnet and Opus take an effort; Haiku 4.5 refuses one
  effort?: "low" | "medium" | "high";
  format?: Record<string, unknown>;
  // "none" on the last step of a tool loop, so it has to answer
  toolChoice?: "auto" | "none";
  userId?: string;
};

// One request to the Messages API, metered. Refuses before sending if the
// month's allowance is already gone.
export async function callClaude(input: CallInput): Promise<{ content: Block[]; stop_reason: string; cost: number; usage: Usage }> {
  const { spent, budget } = await aiSpend();
  if (spent >= budget) throw new OverBudget(`This month's Claude allowance ($${budget.toFixed(2)}) is used up. It resets on the 1st.`);
  const key = await claudeKey();
  if (!key) throw new Error("Claude isn't connected yet. Add an Anthropic API key under Integrations.");

  const outputConfig = {
    ...(input.effort && input.model !== HAIKU ? { effort: input.effort } : {}),
    ...(input.format ? { format: { type: "json_schema", schema: input.format } } : {}),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages,
      ...(input.tools?.length ? { tools: input.tools, ...(input.toolChoice ? { tool_choice: { type: input.toolChoice } } : {}) } : {}),
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Claude answered ${res.status}.`);

  const usage = body.usage as Usage;
  const cost = costOf(input.model, usage);
  await prisma.aiUsage.create({
    data: {
      feature: input.feature,
      model: input.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      costUsd: cost,
      userId: input.userId ?? null,
    },
  });
  if (body.stop_reason === "refusal") throw new Error("Claude declined that request.");
  return { content: body.content, stop_reason: body.stop_reason, cost, usage };
}
