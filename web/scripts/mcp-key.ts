// Connection keys for the MCP endpoint (lib/mcp): one per person, shown once.
//   node --env-file=.env scripts/run.cjs scripts/mcp-key.ts make <email> [--name "Claude"] [--host https://app.easeus.media] [--live]
//   node --env-file=.env scripts/run.cjs scripts/mcp-key.ts list [--live]
//   node --env-file=.env scripts/run.cjs scripts/mcp-key.ts revoke <id> [--live]
// --live works on the live database (NEW_DATABASE_URL in .env); without it, the local one.

async function main() {
  const [cmd = "list", ...rest] = process.argv.slice(3);
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (rest.includes("--live")) {
    if (!process.env.NEW_DATABASE_URL) throw new Error("NEW_DATABASE_URL isn't in .env.");
    process.env.DATABASE_URL = process.env.NEW_DATABASE_URL;
    process.env.DIRECT_URL = process.env.NEW_DIRECT_URL ?? process.env.DIRECT_URL;
  }
  const { prisma } = await import("@/lib/prisma");
  const { makeKey, hashKey } = await import("@/lib/mcp/keys");
  try {
    if (cmd === "make") {
      const email = rest.find((a) => a.includes("@"));
      if (!email) throw new Error("Give the person's email.");
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, employment: true },
      });
      if (!user || user.employment === "former") throw new Error(`Nobody on staff with the email ${email}.`);
      const key = makeKey();
      const made = await prisma.connection.create({
        data: {
          userId: user.id,
          name: flag("--name") ?? "Claude",
          keyHash: hashKey(key),
        },
        select: { id: true },
      });
      const host = flag("--host") ?? (rest.includes("--live") ? "https://app.easeus.media" : "http://localhost:3000");
      console.log(`Connection ${made.id} for ${user.name}. The address, shown once:\n\n  ${host}/api/mcp/${key}\n`);
    } else if (cmd === "revoke") {
      const id = rest.find((a) => !a.startsWith("--"));
      if (!id) throw new Error("Give the connection's id (see list).");
      await prisma.connection.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      console.log(`Connection ${id} revoked.`);
    } else {
      const all = await prisma.connection.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!all.length) console.log("No connections yet.");
      for (const c of all) console.log(`${c.id}  ${c.user.name} <${c.user.email}>  ${c.name}  made ${c.createdAt.toISOString().slice(0, 10)}  last used ${c.lastUsedAt?.toISOString().slice(0, 16) ?? "never"}${c.revokedAt ? "  REVOKED" : ""}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
