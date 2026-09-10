"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <form action={formAction} className="glass w-full max-w-sm rounded-xl p-6">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/logo.png" alt="Easeus" width={24} height={24} className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold">Easeus HQ</span>
        </div>
        <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
        <div className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            autoFocus
            placeholder="you@easeus.media"
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Password"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 pr-9 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {state.error && <p className="text-xs text-red-300">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn-glow rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
