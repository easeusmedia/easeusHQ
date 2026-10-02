import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight, Network } from "lucide-react";

type Crumb = { name: string; href: string };

// Where you are: Organization, then the department, then any of its pages
// (Sales > Outreach > Podcast). Every step but the last is a link.
export function DepartmentHead({ name, trail }: { name?: string; trail?: Crumb[] }) {
  const crumbs = trail ?? [{ name: name ?? "", href: "" }];
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <Link href="/org" className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground">
        <Network size={14} /> Organization
      </Link>
      {crumbs.map((c, i) => (
        <Fragment key={c.href || i}>
          <ChevronRight size={14} className="shrink-0 text-muted/50" />
          {i === crumbs.length - 1 ? (
            <span aria-current="page" className="max-w-[14rem] truncate font-medium">
              {c.name}
            </span>
          ) : (
            <Link href={c.href} className="max-w-[12rem] truncate text-muted transition-colors hover:text-foreground">
              {c.name}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
