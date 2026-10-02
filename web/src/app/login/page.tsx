"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

// a field as a line: a small label above, the line brightening in use
const LINE = "border-b border-white/20 transition-colors duration-300 focus-within:border-white/70 hover:border-white/35";
const LABEL = "text-[10px] font-medium tracking-[0.18em] text-white/50 uppercase";

// Sign in, calm: the Mist theme's misty blue (light at the top corner,
// deep navy below), no card, the mark, two fields drawn as
// lines, and an outlined button that takes the app's blue glass on hover.
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    // the Mist theme's own gradient (globals.css .mist-bg)
    <div className="mist-bg relative isolate flex min-h-screen items-center justify-center overflow-hidden p-6 text-white">

      <form action={formAction} className="rise-in flex w-full max-w-[300px] flex-col items-center">
        <Image src="/logo.png" alt="Easeus" width={44} height={44} className="h-11 w-11 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" priority />
        <p className="mt-5 text-sm tracking-wide text-white/70">Sign in to Easeus HQ</p>

        <div className="mt-14 flex w-full flex-col gap-6">
          <label className={`flex flex-col gap-1.5 pb-2 ${LINE}`}>
            <span className={LABEL}>Email address</span>
            <input name="email" type="email" required autoFocus autoComplete="email" className="bg-transparent text-sm text-white outline-none! [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[transition:background-color_9999s]" />
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

        <p className="mt-16 text-center text-[11px] text-white/45">A private workspace for the Easeus Media team.</p>
      </form>
    </div>
  );
}
