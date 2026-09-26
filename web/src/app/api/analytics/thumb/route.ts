import { getSessionUserId } from "@/lib/auth";

// Instagram's pictures, passed through: its image servers won't hand them to
// another website, so the Analytics tab asks here instead. Only Instagram's
// own image hosts, and only for someone signed in — not a way to fetch
// anything else through the app.
const ALLOWED = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

export async function GET(request: Request) {
  if (!(await getSessionUserId())) return new Response(null, { status: 401 });
  const raw = new URL(request.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) return new Response(null, { status: 400 });
  const res = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return new Response(null, { status: 502 });
  return new Response(res.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=21600" },
  });
}
