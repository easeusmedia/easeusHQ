// Which Frame.io account is this token for, and can it see our shares?
//
//   node --env-file=.env scripts/run.cjs scripts/frameio-check.ts <token>
//
// Answers three things without changing anything: who the token belongs to,
// which accounts it can reach, and whether the share links already on our
// tasks are readable with it. A token from the wrong one of two accounts
// will authenticate perfectly well and then find none of the shares — which
// is the whole point of checking before wiring anything up.
import { prisma } from "@/lib/prisma";

const token = process.argv[3];
if (!token) {
  console.error("Pass the token: scripts/run.cjs scripts/frameio-check.ts <token>");
  process.exit(1);
}

// A legacy developer token needs an extra header; an OAuth one ignores it.
// Try plain first, then legacy, so either kind of token works here.
async function api(path: string): Promise<{ ok: boolean; status: number; body: unknown; legacy: boolean }> {
  for (const legacy of [false, true]) {
    const res = await fetch(`https://api.frame.io/v4${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(legacy ? { "x-frameio-legacy-token-auth": "true" } : {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, body, legacy };
    if (legacy) return { ok: false, status: res.status, body, legacy };
  }
  throw new Error("unreachable");
}

const me = await api("/me");
console.log(`\n/me → ${me.status}${me.legacy ? "  (needed the legacy-token header)" : ""}`);
console.log(JSON.stringify(me.body, null, 2).slice(0, 600));
if (!me.ok) {
  console.log("\nThat token didn't authenticate at all. Check it was copied whole.");
  process.exit(0);
}

const accounts = await api("/accounts");
console.log(`\n/accounts → ${accounts.status}`);
const list = ((accounts.body as { data?: { id: string; display_name?: string; name?: string }[] })?.data ?? []);
for (const a of list) console.log(`   ${a.id}  ${a.display_name ?? a.name ?? ""}`);

// the real test: can it read the shares our tasks actually point at?
const links = await prisma.task.findMany({
  where: { frameioLink: { not: null } },
  select: { title: true, frameioLink: true },
  orderBy: { updatedAt: "desc" },
  take: 3,
});

for (const account of list) {
  console.log(`\n--- as account ${account.display_name ?? account.id} ---`);
  for (const t of links) {
    const redirect = await fetch(t.frameioLink!, { redirect: "manual" });
    const shareId = (redirect.headers.get("location") ?? "").split("/share/")[1]?.split(/[/?]/)[0];
    if (!shareId) {
      console.log(`   ${t.title}: couldn't resolve ${t.frameioLink}`);
      continue;
    }
    const assets = await api(`/accounts/${account.id}/shares/${shareId}/assets?include=media_links.original`);
    const files = ((assets.body as { data?: { name: string; type: string }[] })?.data ?? []);
    console.log(
      `   ${t.title}: ${assets.status} ${assets.ok ? `${files.length} file(s): ${files.map((f) => f.name).join(", ")}` : JSON.stringify(assets.body).slice(0, 160)}`
    );
    if (assets.ok && files.length) console.log(JSON.stringify(files[0], null, 2).slice(0, 900));
  }
}
process.exit(0);
