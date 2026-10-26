import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getAllUsers, onStaff } from "@/lib/users";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { isFounder } from "@/lib/scope";
import { dayOf } from "@/lib/editorKpi";
import { completedCount, currentWork, currentWorkOf } from "./data";
import { PeopleWork, PersonWork } from "./PersonWork";

export const dynamic = "force-dynamic";

// Everyone's work in one place (Abhishek, 26 Oct 2026; it was History): each
// person once, whatever departments they're in, with the tasks they're on
// now by name (Abhishek, 26 Oct 2026: a count said too little). Opening
// someone (?person=) shows what they're working on and everything they've
// finished. Level 1's, as History was.
export default async function TeamWorkPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person: personId } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!isFounder(viewer)) redirect("/home");

  const [users, titles] = await Promise.all([getAllUsers(), prisma.jobTitle.findMany({ select: { id: true, name: true } })]);
  // the title everyone sees, else their role's name, as People shows it
  const titleOf = (u: (typeof users)[number]) => u.position ?? titles.find((t) => t.id === u.jobTitleId)?.name ?? null;
  const today = dayOf(new Date());

  // someone who's left keeps their record, so a link to them still opens it
  const person = personId ? users.find((u) => u.id === personId) : undefined;
  if (person) {
    const [current, completed] = await Promise.all([currentWork(person), completedCount(person.id)]);
    return (
      <PersonWork
        key={person.id}
        person={{ id: person.id, name: person.name, title: titleOf(person) }}
        current={current}
        completed={completed}
        today={today}
        canDelete={isAbhishekOrAdmin(viewer)}
      />
    );
  }

  // what each person is on now, by the same rule as their own page (data.ts
  // currentWorkOf); the people with work on first, then by name
  const staff = users.filter(onStaff);
  const work = await currentWorkOf(staff.map((u) => u.id));
  const people = staff
    .map((u) => ({ id: u.id, name: u.name, title: titleOf(u), now: work.get(u.id) ?? [] }))
    .sort((a, b) => Number(b.now.length > 0) - Number(a.now.length > 0) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team work</h1>
      <PeopleWork people={people} today={today} />
    </div>
  );
}
