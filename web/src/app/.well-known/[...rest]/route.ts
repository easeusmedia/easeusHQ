import { traced } from "@/lib/mcp/trail";

// TEMPORARY (lib/mcp/trail): any other well-known address Claude tries
export const GET = traced(() => new Response("Not found", { status: 404 }));
