import { Fragment } from "react";
import Link from "next/link";

type Crumb = { name: string; href: string };

// Where you are and what this is, in one row: the steps above it small,
// muted and linked (Sales /), then the page's own title, and anything about
// the page on the right
export function DepartmentHead({ parents = [], children, aside }: { parents?: Crumb[]; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <header className="mb-5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {parents.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-2 text-sm">
            {parents.map((c) => (
              <Fragment key={c.href}>
                <Link href={c.href} className="max-w-[12rem] truncate text-muted transition-colors hover:text-foreground">
                  {c.name}
                </Link>
                <span aria-hidden className="text-muted/40">
                  /
                </span>
              </Fragment>
            ))}
          </nav>
        )}
        {children}
      </div>
      {aside && <div className="ml-auto text-sm text-muted">{aside}</div>}
    </header>
  );
}
