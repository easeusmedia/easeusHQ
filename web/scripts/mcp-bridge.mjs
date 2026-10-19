// "Easeus HQ (Dev)": the Claude app on this Mac, connected to the LOCAL
// Easeus HQ (localhost, the test database). The live one is "Easeus HQ",
// added in claude.ai with https://app.easeus.media/api/mcp (sign-in, OAuth).
// The Claude app runs local servers as a program it talks to over
// stdin/stdout, so this passes each message on to the local link and prints
// the answer back. No packages; Node 18+.
//
// - The link (http://localhost:3000/api/mcp/<key>, a key made by
//   `scripts/mcp-key.ts make <email>`) is read on every message from
//   Easeus HQ/data/mcp-link.txt (or EASEUS_MCP_URL_FILE); EASEUS_MCP_URL only
//   when there's no file. (The Claude app rewrites its settings file and can
//   put an old link back, so the file wins.)
// - Easeus HQ not running (Claude opened first)? It starts it (next dev, in
//   the background) and waits for it, so the connector never fails at start.
// - The handshake is answered here at once, and the tool list from the last
//   time it was read (data/mcp-tools.json), so Claude registers the server
//   while the app is still starting.
//   claude_desktop_config.json: { "command": "node", "args": ["<this file>"] }
import { createInterface } from "node:readline";
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const WEB = here("..");
const DATA = here("../../data/");
const linkFile = process.env.EASEUS_MCP_URL_FILE || `${DATA}mcp-link.txt`;
const toolsFile = `${DATA}mcp-tools.json`;
const lockFile = `${DATA}dev-server.lock`;
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

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

const post = (body) => fetch(linkNow(), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body });
const down = (err) => /ECONNREFUSED|fetch failed|ECONNRESET|socket/i.test(String(err?.cause?.code ?? err?.cause ?? err?.message ?? err));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Easeus HQ answering, else started once (one starter at a time across every
// copy of this bridge: the lock) and waited for, up to two minutes
let starting = null;
function ensureApp() {
  starting ??= (async () => {
    const up = async () => {
      try {
        const r = await post(JSON.stringify({ jsonrpc: "2.0", id: "up", method: "ping" }));
        return r.status !== 502 && r.status !== 503;
      } catch (err) {
        if (down(err)) return false;
        throw err;
      }
    };
    if (await up()) return;
    let mine = false;
    try {
      // a lock older than two minutes is a start that died: take it over
      try {
        if (Date.now() - statSync(lockFile).mtimeMs > 120_000) unlinkSync(lockFile);
      } catch {}
      closeSync(openSync(lockFile, "wx"));
      mine = true;
    } catch {}
    if (mine) {
      const log = openSync(`${DATA}dev-server.log`, "a");
      spawn(process.execPath, [here("../node_modules/next/dist/bin/next"), "dev"], { cwd: WEB, detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
      process.stderr.write("Easeus HQ wasn't running on this Mac: starting it.\n");
    }
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      if (await up()) return;
    }
    throw new Error("Easeus HQ didn't start on this Mac within two minutes. See data/dev-server.log.");
  })().finally(() => {
    starting = null;
  });
  return starting;
}

async function forward(line, id, method) {
  let res;
  try {
    res = await post(line);
  } catch (err) {
    if (!down(err)) throw err;
    await ensureApp();
    res = await post(line);
  }
  // a notification: nothing to say back
  if (res.status === 202) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Easeus HQ answered ${res.status}.`);
  // an answer sent as one server-sent event
  const data = (text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("") : text).trim();
  if (method === "tools/list" && id !== null) {
    try {
      writeFileSync(toolsFile, JSON.stringify(JSON.parse(data).result));
    } catch {}
  }
  return data;
}

const say = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  let msg = {};
  try {
    msg = JSON.parse(line);
  } catch {}
  const id = msg.id ?? null;
  try {
    // the handshake, here and now, while the app is woken in the background
    if (msg.method === "initialize") {
      ensureApp().catch(() => {});
      const asked = msg.params?.protocolVersion;
      return say({ jsonrpc: "2.0", id, result: { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "Easeus HQ (Dev)", version: "1" }, instructions: "Easeus HQ (Dev): the Sales dashboard on this Mac's test copy, not the live site. Start with list_boards." } });
    }
    if (msg.method === "notifications/initialized") return;
    // the tools, as last read, while the app is still starting
    if (msg.method === "tools/list") {
      let cached = null;
      try {
        cached = JSON.parse(readFileSync(toolsFile, "utf8"));
      } catch {}
      if (cached) {
        forward(line, id, "tools/list").catch(() => {});
        return say({ jsonrpc: "2.0", id, result: cached });
      }
    }
    const data = await forward(line, id, msg.method);
    if (data) process.stdout.write(data + "\n");
  } catch (err) {
    if (id === null) return;
    const message = String(err instanceof Error ? err.message : err).slice(0, 300);
    say({ jsonrpc: "2.0", id, error: { code: -32000, message } });
  }
});
