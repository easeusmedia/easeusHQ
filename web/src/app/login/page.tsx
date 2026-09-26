"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  // The first screen anyone new sees: the name, one line on what this is,
  // two labelled fields and one obvious button.
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      {/* a faint light from above, so the page isn't a flat black void */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.07),transparent)]"
      />
      <form action={formAction} className="fade-in relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface shadow-lg">
            <Image src="/logo.png" alt="Easeus" width={26} height={26} className="h-[26px] w-[26px] object-contain" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Easeus HQ</h1>
            <p className="mt-1 text-sm text-muted">Where the team runs every client&apos;s work.</p>
          </div>
        </div>

        <div className="card-surface flex flex-col gap-4 rounded-2xl p-6 shadow-xl">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Work email
            <input
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@easeus.media"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Password
            <span className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 pr-10 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          {state.error && <p className="text-xs text-red-300">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full disabled:opacity-60">
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-muted">No account? Ask an admin to add you.</p>
      </form>
    </div>
  );
}
