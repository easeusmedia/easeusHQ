// Where open pages hear that something changed (Pulse.tsx; the database
// side is scripts/realtime.ts): the Supabase project, and its publishable
// key. That key is public by design and the database is closed to it, so
// it's fine to reach the browser. The project is read off DATABASE_URL
// ("postgres.<project>") when no address is set.
// Each project's publishable key, so a page only ever pairs a project with
// its own: production (Easeus HQ, Mumbai) since 6 Oct 2026. The dev database
// (Tokyo) has none here, so a dev deployment just polls; locally .env.local
// names it.
const PUBLISHABLE_KEYS: Record<string, string> = {
  dkzihewokwzvcljqnywl: "sb_publishable_a2jgmRHl38Ld8MklrzNHQA_NBZ1IrRa",
};

export function liveLine(): { url: string; key: string } | null {
  let project = "";
  try {
    project = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").username).split(".")[1] ?? "";
  } catch {
    // no usable DATABASE_URL: no live line, the pulse carries on
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || (project ? `https://${project}.supabase.co` : "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLISHABLE_KEYS[project] || "";
  return url && key ? { url, key } : null;
}
