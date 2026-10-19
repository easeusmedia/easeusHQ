// The Claude desktop app's way in to the app's MCP link on this Mac: it runs
// local servers as a program it talks to over stdin/stdout, so this passes
// each message on to the link and prints the answer back. No packages; Node 18+.
// The link is read on every message from Easeus HQ/data/mcp-link.txt (or
// EASEUS_MCP_URL_FILE), which Integrations › Make a new link rewrites on this
// Mac, so a new link works at once whatever the app's settings say (the
// Claude app rewrites its settings file and can put an old link back);
// EASEUS_MCP_URL only when there's no file.
//   claude_desktop_config.json: { "command": "node", "args": ["<this file>"] }
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const linkFile = process.env.EASEUS_MCP_URL_FILE || fileURLToPath(new URL("../../data/mcp-link.txt", import.meta.url));
const linkNow = () => {
  try {
    const link = readFileSync(linkFile, "utf8").trim();
    if (link) return link;
  } catch {}
  return process.env.EASEUS_MCP_URL ?? "";
};
if (!linkNow()) {
  process.stderr.write("Set EASEUS_MCP_URL_FILE (or EASEUS_MCP_URL) to the connection link.\n");
  process.exit(1);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  let id = null;
  try {
    id = JSON.parse(line).id ?? null;
  } catch {}
  try {
    const res = await fetch(linkNow(), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: line });
    // a notification: nothing to say back
    if (res.status === 202) return;
    const text = await res.text();
    if (!res.ok) throw new Error(text || `The app answered ${res.status}.`);
    // an answer sent as one server-sent event
    const data = text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("") : text;
    process.stdout.write(data.trim() + "\n");
  } catch (err) {
    if (id === null) return;
    const message = err instanceof Error && /fetch failed|ECONNREFUSED/.test(String(err.cause ?? err.message)) ? "Easeus HQ isn't running on this Mac (localhost:3000). Start it and try again." : String(err instanceof Error ? err.message : err).slice(0, 300);
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");
  }
});
