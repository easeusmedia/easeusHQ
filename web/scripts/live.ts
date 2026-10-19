// `--live` on a script's command: it works on the live database
// (NEW_DATABASE_URL and NEW_DIRECT_URL in .env) instead of the local one.
// Import it first, before anything that opens the database.
if (process.argv.includes("--live")) {
  if (!process.env.NEW_DATABASE_URL) throw new Error("NEW_DATABASE_URL isn't in .env.");
  process.env.DATABASE_URL = process.env.NEW_DATABASE_URL;
  process.env.DIRECT_URL = process.env.NEW_DIRECT_URL ?? process.env.DIRECT_URL;
  console.log("Working on the LIVE database.");
}
export {};
