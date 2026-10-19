import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE } from "@/lib/consent";
import { getRealViewer } from "@/lib/auth";
import { connectsClaude } from "@/lib/scope";
import { checkAuthorize } from "@/lib/mcp/oauth";
import { trail } from "@/lib/mcp/trail";

export const dynamic = "force-dynamic";

const PARAMS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

// Where Claude sends someone to connect it (OAuth, lib/mcp/oauth): signed in
// (or sent to sign in and back), they allow it or not. Their Allow goes to
// /api/oauth/authorize, which hands Claude its code. In the sign-in page's look.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const p = Object.fromEntries(PARAMS.flatMap((k) => (typeof raw[k] === "string" ? [[k, raw[k]]] : []))) as Partial<Record<(typeof PARAMS)[number], string>>;
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "mist";
  const checked = checkAuthorize(p);
  const me = await getRealViewer();
  if (!me && !("error" in checked)) await trail("PAGE /oauth/authorize | signed out, to /login");
  if (!me && !("error" in checked)) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(p)}`)}`);
  const allowed = !!me && connectsClaude(me);
  await trail(`PAGE /oauth/authorize | ${Object.keys(p).join(" ")} redirect_uri=${p.redirect_uri} resource=${p.resource} scope=${p.scope} | ${"error" in checked ? checked.error : allowed ? "Allow shown" : "refused"}`);

  return (
    <div data-theme={theme} className="login-root relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-6 text-white">
      <div aria-hidden className={`mist-bg absolute inset-0 -z-10 ${theme === "mist" ? "opacity-100" : "opacity-0"}`} />
      <form method="post" action="/api/oauth/authorize" className="rise-in flex w-full max-w-[340px] flex-col items-center text-center">
        <Image src="/logo.png" alt="Easeus" width={44} height={44} className="h-11 w-11 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" priority />
        <p className="mt-5 text-sm tracking-wide text-white/70">Connect Claude to Easeus HQ</p>

        {"error" in checked ? (
          <p className="mt-10 text-sm text-red-200">{checked.error}</p>
        ) : (
          <>
            {PARAMS.map((k) => p[k] !== undefined && <input key={k} type="hidden" name={k} value={p[k]} />)}
            <p className="mt-10 text-xs text-white/55">Signed in as {me?.name}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              {allowed ? "Claude will read the Sales boards and add, update and move leads as you. It can't delete anything." : "Only Level 1, and Level 2 in Sales, can connect Claude."}
            </p>
            <div className="mt-10 flex items-center gap-3">
              <button type="submit" name="decision" value="deny" className="rounded-full px-6 py-2.5 text-sm text-white/65 transition-colors hover:text-white">
                {allowed ? "Cancel" : "Back to Claude"}
              </button>
              {allowed && (
                <button type="submit" name="decision" value="allow" className="btn-frost flex h-11 items-center rounded-full px-10 text-sm font-medium tracking-wide">
                  Allow
                </button>
              )}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
