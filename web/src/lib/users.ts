import { cache } from "react";
import { prisma } from "./prisma";
import { photoSrcAt } from "./photos";
import { photoVersions } from "./pictureVersions";
import { isFounder } from "./scope";

// De-duplicated across one request — layout.tsx and whichever page renders
// alongside it both need the users list, and Prisma calls (unlike fetch())
// aren't automatically cached per-request, so without this every navigation
// ran this same query two or three times over.
//
// An explicit select, not the whole row. Two reasons, one of which is a real
// bug: User now carries `salary`, a Prisma Decimal, and Decimals are not
// serialisable across the server/client boundary — handing a whole row to a
// client component (the sidebar does exactly that) throws "Only plain
// objects can be passed to Client Components". The other is that these rows
// reach the browser, and an employment record has no business travelling
// with them. Anything that genuinely needs salary reads it server-side in
// the people directory, which gates on canEditPeople.
// avatarUrl comes back as the photo's address (lib/photos.ts), never the
// stored picture — these rows go to the browser on every refresh, and the
// picture isn't even read from the database (lib/pictureVersions.ts).
export const getAllUsers = cache(async () => {
  const [users, photos] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastSeenAt: true,
        teamId: true,
        jobTitleId: true,
        // the title everyone sees
        position: true,
        // their own look: dark or mist
        theme: true,
        employment: true,
      },
      orderBy: { name: "asc" },
    }),
    photoVersions(),
  ]);
  return users.map((u) => ({ ...u, avatarUrl: photoSrcAt(u.id, photos.get(u.id)) }));
});

// Who's still here. A former employee keeps their history — the work they
// finished, tasks still on them, their name in an activity trail — but stops
// existing as a colleague: not in chat, not in the sidebar, not online, not
// someone you can message or hand anything to. The people directory is the
// one exception (admin and core only): it's where they're reinstated.
export function onStaff(u: { employment: string }): boolean {
  return u.employment !== "former";
}

// Who new editing work can go to. A former employee keeps their history and
// any task still on them, but never shows up to be handed anything new.
export function assignableEditors<T extends { role: string; employment: string }>(users: T[]): T[] {
  return users.filter((u) => u.role === "employee" && onStaff(u));
}

// Who a person may hand work to, down the levels (lib/scope canAssign): a
// Member only to themselves; a Founder to any Member still on the team, or
// themselves; a Lead to the Members in their departments, or themselves.
export function assignOptionsFor<T extends { id: string; role: string; employment: string; teamId?: string | null }>(
  actor: { id: string; role: string; email?: string | null; departments?: { id: string }[] },
  users: T[]
): T[] {
  if (actor.role === "employee") return users.filter((u) => u.id === actor.id);
  const depts = actor.departments?.map((d) => d.id) ?? [];
  return users.filter(
    (u) => onStaff(u) && (u.id === actor.id || (u.role === "employee" && (isFounder(actor) || (!!u.teamId && depts.includes(u.teamId)))))
  );
}
