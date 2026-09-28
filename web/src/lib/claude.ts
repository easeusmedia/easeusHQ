import { callClaude, HAIKU, type Block, type Message, type Tool } from "./ai";

// Talking to Claude for the contract assistant and the Frame.io sorter. Both
// go through lib/ai.ts, which meters every call against the month's
// allowance; the key and the shared types live there too.
export { CLAUDE_SETTINGS, claudeKey, type Block, type Message, type Tool } from "./ai";

// Haiku: the cheapest current Claude, and plenty for editing a contract
// through tools. ponytail: switch to "claude-sonnet-5" if edits need more care.
export const CLAUDE_MODEL = HAIKU;

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
  return callClaude({ feature: "contracts", model: CLAUDE_MODEL, system, messages, tools, maxTokens });
}

// One answer in a fixed JSON shape, for sorting and extracting rather than
// conversation. Haiku: a classification doesn't need more.
export async function claudeJson<T>({ system, prompt, schema, maxTokens = 4096 }: { system: string; prompt: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<T> {
  const res = await callClaude({ feature: "frameio", model: HAIKU, system, messages: [{ role: "user", content: prompt }], format: schema, maxTokens });
  const text = res.content.find((b): b is { type: "text"; text: string } => b.type === "text")?.text;
  if (!text) throw new Error("Claude sent nothing back.");
  return JSON.parse(text) as T;
}

// A key is good if it can list the models
export async function checkClaudeKey(key: string): Promise<boolean> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  return res.ok;
}
