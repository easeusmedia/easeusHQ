import Link from "next/link";
import { Avatar } from "../TaskCard";
import { TagPill } from "./TagPill";

export type ClientCardData = {
  id: string;
  name: string;
  status: string;
  niche: string | null;
  avatarUrl: string | null;
  tags: { id: string; name: string; color: string }[];
  projectCount: number;
  taskCount: number;
  invoiceCount: number;
};

// Deliberately minimal — name, tags, and the two numbers that answer
// "is anything actually happening here right now": active projects,
// active tasks. Everything else (niche, invoices, billing, deliverable
// history) lives one click away on the client's own page.
export function ClientCard({ client }: { client: ClientCardData }) {
  return (
    <Link
      href={`/tasks/clients/${client.id}`}
      data-client-id={client.id}
      className="card-surface flex min-w-0 flex-col gap-2 rounded-xl p-3 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        {client.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
          <img src={client.avatarUrl} alt={client.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <Avatar name={client.name} size={36} />
        )}
        <p className="min-w-0 truncate font-medium">{client.name}</p>
      </div>

      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {client.tags.map((t) => (
            <TagPill key={t.id} name={t.name} color={t.color} size="xs" />
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        {client.projectCount} active project{client.projectCount === 1 ? "" : "s"} · {client.taskCount} active task
        {client.taskCount === 1 ? "" : "s"}
      </p>
    </Link>
  );
}
