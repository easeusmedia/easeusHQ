import { cache } from "react";
import { prisma } from "./prisma";

// De-duplicated across one request — layout.tsx and whichever page renders
// alongside it both need the users list, and Prisma calls (unlike fetch())
// aren't automatically cached per-request, so without this every navigation
// ran this same query two or three times over.
export const getAllUsers = cache(() => prisma.user.findMany({ orderBy: { name: "asc" } }));
