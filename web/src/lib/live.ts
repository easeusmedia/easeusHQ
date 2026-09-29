// Where open pages hear that something changed (Pulse.tsx; the database
// side is scripts/realtime.ts): the Supabase project, and its publishable
// key. That key is public by design and the database is closed to it, so
// it's fine to reach the browser. The project is read off DATABASE_URL
// ("postgres.<project>") when no address is set.
const PUBLISHABLE_KEY = "";

export function liveLine(): { url: string; key: string } | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLISHABLE_KEY;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) {
    try {
      const project = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").username).split(".")[1];
      if (project) url = `https://${project}.supabase.co`;
    } catch {
      // no usable DATABASE_URL: no live line, the 15s pulse carries on
    }
  }
  return url && key ? { url, key } : null;
}
