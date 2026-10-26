import { redirect } from "next/navigation";

// History is Team work now (Abhishek, 26 Oct 2026). Old links, a person's
// profile among them, land there, on the same person if they named one.
// The CSV export stays at /history/export.
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  redirect(person ? `/team-work?person=${encodeURIComponent(person)}` : "/team-work");
}
