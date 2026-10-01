import { redirect } from "next/navigation";

// The Board now lives under Organization, as Production's page
export default async function BoardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  redirect(`/org/production${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`);
}
