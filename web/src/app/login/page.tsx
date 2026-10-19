import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/consent";
import { LoginForm } from "./LoginForm";

// Sign in, in the look picked last on this device (Mist unless Dark was).
// `next`: a page of this app to go on to (Claude's Connect sends people
// here and back, app/oauth/authorize)
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "mist";
  const { next } = await searchParams;
  return <LoginForm theme={theme} next={next} />;
}
