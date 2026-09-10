import Link from "next/link";

// Catches any URL that doesn't match a real route — a mistyped link, a
// stale bookmark, a copy-pasted gateway link that's since moved — instead
// of the framework's default unstyled 404.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="glass w-full max-w-sm rounded-xl p-6 text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-lg font-semibold">This page doesn't exist</h1>
        <p className="mt-2 text-sm text-muted">
          The link may be old or mistyped. Head back to the board.
        </p>
        <Link
          href="/tasks"
          className="btn-glow mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium"
        >
          Back to Board
        </Link>
      </div>
    </div>
  );
}
