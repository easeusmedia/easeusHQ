import { cache } from "react";
import { prisma } from "./prisma";

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
export const getAllUsers = cache(() =>
  prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      lastSeenAt: true,
      teamId: true,
      jobTitleId: true,
      employment: true,
    },
    orderBy: { name: "asc" },
  })
);
