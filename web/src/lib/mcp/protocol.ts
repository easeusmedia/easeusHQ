// The MCP wire protocol, the little of it a tools-only server needs: JSON-RPC
// 2.0 over one HTTP POST at a time (Streamable HTTP, stateless). Pure, so it's
// tested on its own; the route (app/api/mcp) does the key and the HTTP.

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: unknown) => Promise<unknown>;
};

export type ServerInfo = {
  name: string;
  version: string;
  instructions: string;
  // what Claude shows for the connector (MCP 2025-11-25): our own icon, not
  // the parent domain's favicon it falls back to (easeus.media's blue one)
  icons?: { src: string; mimeType: string; sizes: string[] }[];
  websiteUrl?: string;
};

// A message to the person's Claude rather than a crash: what went wrong, in words
export class ToolError extends Error {}

export type RpcId = string | number | null;
export type RpcRequest = {
  jsonrpc?: string;
  id?: RpcId;
  method?: string;
  params?: unknown;
};
export type RpcResponse = {
  jsonrpc: "2.0";
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// the versions this server speaks; a client asking for one of them gets it back, else the newest
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const reply = (id: RpcId, result: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});
const fail = (id: RpcId, code: number, message: string, data?: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

// One request in, one response out; null for a notification (nothing to say
// back). A batch (an array) is refused: one message at a time, so one POST
// never fans out into hundreds of queries.
export async function handleRpc(msg: unknown, tools: Tool[], info: ServerInfo): Promise<RpcResponse | null> {
  if (Array.isArray(msg)) return fail(null, -32600, "One request at a time, not a batch.");
  return handleOne(msg, tools, info);
}

async function handleOne(msg: unknown, tools: Tool[], info: ServerInfo): Promise<RpcResponse | null> {
  if (!msg || typeof msg !== "object") return fail(null, -32600, "Not a JSON-RPC request.");
  const { id = null, method, params } = msg as RpcRequest;
  const notification = !("id" in (msg as object));
  if (typeof method !== "string") return notification ? null : fail(id, -32600, "No method.");
  // nothing is said back to a notification, whatever it is
  if (notification) return null;
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;

  switch (method) {
    case "initialize": {
      const asked = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return reply(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version, ...(info.icons && { icons: info.icons }), ...(info.websiteUrl && { websiteUrl: info.websiteUrl }) },
        instructions: info.instructions,
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const name = typeof p.name === "string" ? p.name : "";
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(id, -32602, `No tool called ${name || "(none)"}.`);
      try {
        const result = await tool.run(p.arguments ?? {});
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 1);
        return reply(id, { content: [{ type: "text", text }], isError: false });
      } catch (err) {
        if (err instanceof ToolError)
          return reply(id, {
            content: [{ type: "text", text: err.message }],
            isError: true,
          });
        console.error(err);
        return reply(id, {
          content: [
            {
              type: "text",
              text: "That didn't work on the app's side. Try again, and tell Abhishek if it keeps failing.",
            },
          ],
          isError: true,
        });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
