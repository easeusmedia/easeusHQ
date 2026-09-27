import { prisma } from "./prisma.ts";

// Talking to Claude (Anthropic's Messages API), for the contract assistant.
// The key is kept in the app's settings (Integrations → Claude), so it can
// be changed without a redeploy; ANTHROPIC_API_KEY works too.

export const CLAUDE_SETTINGS = { key: "anthropic.apiKey" } as const;

// Haiku: the cheapest current Claude, and plenty for editing a contract
// through tools. ponytail: switch to "claude-sonnet-5" if edits need more care.
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

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

export async function claude({
  system,
  messages,
  tools,
  maxTokens = 4096,
}: {
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
}): Promise<{ content: Block[]; stop_reason: string }> {
  const key = await claudeKey();
  if (!key) throw new Error("Claude isn't connected yet. Add an Anthropic API key under Integrations.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages, tools }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Claude answered ${res.status}.`);
  return body;
}

// A key is good if it can list the models
export async function checkClaudeKey(key: string): Promise<boolean> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  return res.ok;
}
