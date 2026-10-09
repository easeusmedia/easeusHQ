import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The front door: Home when signed in, otherwise straight to sign-in. The
// public description of the app lives at /about.
export default async function Root() {
  redirect((await getSessionUserId()) ? "/home" : "/login");
}
