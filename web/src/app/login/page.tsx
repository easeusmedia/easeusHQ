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
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="rise-in relative w-full max-w-[400px]">
        <form action={formAction} className="panel rounded-[28px] p-8 sm:p-9">
          <div className="flex flex-col items-center text-center">
            <span className="badge flex size-14 items-center justify-center rounded-2xl">
              <Image src="/logo.png" alt="Easeus" width={26} height={26} className="h-[26px] w-[26px] object-contain" priority />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">Sign in to continue to Easeus HQ.</p>
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
                placeholder="Work email"
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
        <p className="mt-6 text-center text-xs text-muted/70">A private workspace for the Easeus Media team.</p>
      </div>
    </div>
  );
}
