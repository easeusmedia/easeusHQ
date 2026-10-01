import Link from "next/link";
import { ChevronRight, Network } from "lucide-react";

// Where you are: Organization, then the department
export function DepartmentHead({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm">
      <Link href="/org" className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground">
        <Network size={14} /> Organization
      </Link>
      <ChevronRight size={14} className="text-muted/50" />
      <span className="font-medium">{name}</span>
    </nav>
  );
}
