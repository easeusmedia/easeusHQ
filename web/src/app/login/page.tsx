import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/consent";
import { LoginForm } from "./LoginForm";

// Sign in, in the look picked last on this device (Mist unless Dark was)
export default async function LoginPage() {
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "mist";
  return <LoginForm theme={theme} />;
}
