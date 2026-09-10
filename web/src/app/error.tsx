"use client";

import Link from "next/link";

// Root error boundary — catches anything a Server or Client Component
// throws instead of letting Next.js show the generic "Server Components
// render" digest banner. A bad query param, a stray API failure, whatever
// slips through: this is the last line of defense so the app never shows
// raw error text.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="glass w-full max-w-sm rounded-xl p-6 text-center">
        <p className="text-sm font-medium text-muted">Something went wrong</p>
        <h1 className="mt-1 text-lg font-semibold">This page hit a snag</h1>
        <p className="mt-2 text-sm text-muted">Try again, or head back to the board.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn-glow rounded-md px-4 py-2 text-sm font-medium">
            Try again
          </button>
          <Link href="/tasks" className="rounded-md px-4 py-2 text-sm text-muted hover:bg-hover">
            Back to Board
          </Link>
        </div>
      </div>
    </div>
  );
}
