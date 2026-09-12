import Link from "next/link";
import { Avatar } from "../TaskCard";

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
        <div className="min-w-0">
          <p className="truncate font-medium">{client.name}</p>
          {client.niche && <p className="truncate text-xs text-muted">{client.niche}</p>}
        </div>
      </div>

      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {client.tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${t.color}26`, borderColor: `${t.color}4d`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        {client.projectCount} project{client.projectCount === 1 ? "" : "s"} · {client.taskCount} task
        {client.taskCount === 1 ? "" : "s"} · {client.invoiceCount} invoice{client.invoiceCount === 1 ? "" : "s"}
      </p>
    </Link>
  );
}
