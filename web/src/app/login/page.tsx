"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      {/* the backdrop: slow light behind a fading grid (see .aurora in globals.css) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="aurora left-[12%] top-[8%] size-[34rem] bg-[#4b95e6]" />
        <div className="aurora bottom-[4%] right-[10%] size-[30rem] bg-[#2f5fc4] [animation-delay:-9s] [animation-duration:32s]" />
        <div className="aurora left-[46%] top-[52%] size-[22rem] bg-[#3fb7c9] opacity-25 [animation-delay:-17s] [animation-duration:38s]" />
        <div className="login-grid absolute inset-0" />
      </div>

      <div className="rise-in relative w-full max-w-[400px]">
        <form action={formAction} className="glass-card rounded-[28px] p-8">
          <div className="flex flex-col items-center text-center">
            <span className="badge-lit flex size-14 items-center justify-center rounded-2xl">
              <Image src="/logo.png" alt="Easeus" width={26} height={26} className="h-[26px] w-[26px] object-contain drop-shadow-[0_0_10px_rgba(75,149,230,0.55)]" priority />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">Sign in to Easeus HQ</p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <label className="field flex items-center gap-3 rounded-2xl px-4">
              <Mail size={16} className="shrink-0 text-muted" />
              <input
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@easeus.media"
                aria-label="Email"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
              />
            </label>
            <label className="field flex items-center gap-3 rounded-2xl pl-4 pr-2">
              <LockKeyhole size={16} className="shrink-0 text-muted" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Password"
                aria-label="Password"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </label>

            {state.error && <p className="fade-in px-1 text-xs text-red-300">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="btn-primary group mt-2 flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold disabled:opacity-70"
            >
              {pending ? "Signing in…" : "Sign in"}
              {!pending && <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />}
            </button>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-muted/70">Easeus Media · the team&apos;s workspace</p>
      </div>
    </div>
  );
}
