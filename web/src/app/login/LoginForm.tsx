"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { ArrowRight, CloudFog, Eye, EyeOff, Moon } from "lucide-react";
import { saveTheme } from "@/lib/consent";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

// a field as a line: a small label above, the line brightening in use
const LINE = "border-b border-white/20 transition-colors duration-300 focus-within:border-white/70 hover:border-white/35";
const LABEL = "text-[11px] font-medium tracking-[0.18em] text-white/50 uppercase";

const THEMES = [
  { id: "mist", label: "Mist", Icon: CloudFog },
  { id: "dark", label: "Dark", Icon: Moon },
] as const;

// Sign in, calm: the Mist theme's misty blue (light at the top corner,
// deep navy below) or the dark theme's near-black, picked at the top right;
// no card, the mark, two fields drawn as lines, and an outlined button that
// takes the app's blue glass on hover. A look picked here is the app's too
// once signed in.
export function LoginForm({ theme: initial }: { theme: "dark" | "mist" }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState(initial);
  const [picked, setPicked] = useState(false);

  return (
    <div data-theme={theme} className="login-root relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-6 text-white">
      {/* Mist: the theme's own gradient (globals.css .mist-bg), fading over the dark */}
      <div aria-hidden className={`mist-bg absolute inset-0 -z-10 transition-opacity duration-500 ${theme === "mist" ? "opacity-100" : "opacity-0"}`} />
      <div role="radiogroup" aria-label="Theme" className="absolute top-5 right-5 flex gap-1 rounded-full border border-white/12 bg-white/[0.05] p-1 backdrop-blur-md">
        {THEMES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            onClick={() => {
              setTheme(id);
              setPicked(true);
              saveTheme(id);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors duration-300 ${theme === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      <form action={formAction} className="rise-in flex w-full max-w-[300px] flex-col items-center">
        {/* the look picked here becomes theirs in the app */}
        {picked && <input type="hidden" name="theme" value={theme} />}
        <Image src="/logo.png" alt="Easeus" width={44} height={44} className="h-11 w-11 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" priority />
        <p className="mt-5 text-sm tracking-wide text-white/70">Sign in to Easeus HQ</p>

        <div className="mt-14 flex w-full flex-col gap-6">
          <label className={`flex flex-col gap-1.5 pb-2 ${LINE}`}>
            <span className={LABEL}>Email address</span>
            <input name="email" type="email" required autoFocus autoComplete="email" defaultValue={state.email} className="bg-transparent text-sm text-white outline-none! [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[transition:background-color_9999s]" />
          </label>
          <label className={`flex flex-col gap-1.5 pb-2 ${LINE}`}>
            <span className={LABEL}>Password</span>
            <span className="flex items-center gap-2">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none! [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[transition:background-color_9999s]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="text-white/45 transition-colors hover:text-white"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
        </div>

        {state.error && <p className="fade-in mt-5 text-center text-xs text-red-200">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          // a simple frosted button (globals.css .btn-frost)
          className="btn-frost group mt-12 flex h-11 items-center gap-2 rounded-full px-10 text-sm font-medium tracking-wide disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
          {!pending && <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />}
        </button>

        {/* no reset by email: Level 1 sets a new one from Employees */}
        <p className="mt-5 text-center text-[12px] text-white/55">Forgot your password? Ask your admin to reset it.</p>

        <p className="mt-12 text-center text-[12px] text-white/45">A private workspace for the Easeus Media team.</p>
      </form>
    </div>
  );
}
