import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, ToolError, type Tool } from "./protocol.ts";

const info = { name: "Easeus HQ", version: "1", instructions: "hello" };
const tools: Tool[] = [
  {
    name: "echo",
    description: "says it back",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    run: async (a) => ({ said: (a as { text: string }).text }),
  },
  {
    name: "refuse",
    description: "always a tool error",
    inputSchema: { type: "object" },
    run: async () => {
      throw new ToolError("Not like that.");
    },
  },
  {
    name: "crash",
    description: "always a crash",
    inputSchema: { type: "object" },
    run: async () => {
      throw new Error("boom");
    },
  },
];

test("initialize answers with a version it speaks, else the newest", async () => {
  const r = (await handleRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    },
    tools,
    info,
  )) as {
    result: {
      protocolVersion: string;
      serverInfo: { name: string };
      instructions: string;
    };
  };
  assert.equal(r.result.protocolVersion, "2025-06-18");
  assert.equal(r.result.serverInfo.name, "Easeus HQ");
  assert.equal(r.result.instructions, "hello");
  const r2 = (await handleRpc(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    },
    tools,
    info,
  )) as { result: { protocolVersion: string } };
  assert.equal(r2.result.protocolVersion, "2025-11-25");
});

test("a notification gets nothing back; ping and tools/list answer", async () => {
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, info), null);
  assert.deepEqual(await handleRpc({ jsonrpc: "2.0", id: "a", method: "ping" }, tools, info), { jsonrpc: "2.0", id: "a", result: {} });
  const list = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, tools, info)) as { result: { tools: { name: string }[] } };
  assert.deepEqual(
    list.result.tools.map((t) => t.name),
    ["echo", "refuse", "crash"],
  );
});

test("tools/call runs the tool; a tool error is said in words; a crash is not leaked", async () => {
  const ok = (await handleRpc(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "echo", arguments: { text: "hi" } },
    },
    tools,
    info,
  )) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(ok.result.isError, false);
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { said: "hi" });
  const no = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "refuse" } }, tools, info)) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(no.result.isError, true);
  assert.equal(no.result.content[0].text, "Not like that.");
  const crash = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "crash" } }, tools, info)) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(crash.result.isError, true);
  assert.doesNotMatch(crash.result.content[0].text, /boom/);
  const none = (await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } }, tools, info)) as { error: { code: number } };
  assert.equal(none.error.code, -32602);
});

test("unknown methods, bad input and batches", async () => {
  const unknown = (await handleRpc({ jsonrpc: "2.0", id: 8, method: "resources/list" }, tools, info)) as { error: { code: number } };
  assert.equal(unknown.error.code, -32601);
  const bad = (await handleRpc("nonsense", tools, info)) as {
    error: { code: number };
    id: null;
  };
  assert.equal(bad.error.code, -32600);
  assert.equal(bad.id, null);
  const batch = (await handleRpc(
    [
      { jsonrpc: "2.0", id: 9, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ],
    tools,
    info,
  )) as { id: number }[];
  assert.deepEqual(
    batch.map((r) => r.id),
    [9],
  );
  assert.equal(await handleRpc([{ jsonrpc: "2.0", method: "notifications/initialized" }], tools, info), null);
});
