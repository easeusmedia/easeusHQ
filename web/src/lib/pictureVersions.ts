import { cache } from "react";
import { prisma } from "./prisma";

// Each stored picture's version, without the picture: the database hashes it
// and sends ten characters. Every page shows people's photos and clients'
// logos, and loading the pictures themselves just to address them was most
// of what each request pulled out of the database (and of the plan's
// transfer allowance). Once per request; build addresses with
// lib/photos.ts photoSrcAt / logoSrcAt.
type Row = { id: string; v: string };
const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r.v]));

export const photoVersions = cache(async () => byId(await prisma.$queryRaw<Row[]>`select id, left(md5("avatarUrl"), 10) as v from "User" where "avatarUrl" is not null`));
export const logoVersions = cache(async () => byId(await prisma.$queryRaw<Row[]>`select id, left(md5("avatarUrl"), 10) as v from "Client" where "avatarUrl" is not null`));
