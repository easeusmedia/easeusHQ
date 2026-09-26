import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/links";
import type { TaskStatus } from "@/lib/workflow";

// What a client's shared pages have in common.

// The client, only while their page is shared.
export async function sharedClient(slug: string) {
  const client = await prisma.client.findUnique({ where: { slug } });
  return client?.shareEnabled ? client : null;
}

// The editing stages, in the client's words
const STAGE: Partial<Record<TaskStatus, { label: string; className: string }>> = {
  queued: { label: "Up next", className: "border-border bg-surface text-muted" },
  editing: { label: "In production", className: "border-blue-400/30 bg-blue-400/15 text-blue-300" },
  revision_requested: { label: "In production", className: "border-blue-400/30 bg-blue-400/15 text-blue-300" },
  sent_for_approval: { label: "In our review", className: "border-purple-400/30 bg-purple-400/15 text-purple-300" },
  sent_for_client_approval: { label: "Ready for your review", className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-300" },
  final_export_ready: { label: "Finalising", className: "border-green-400/30 bg-green-400/15 text-green-300" },
  delivered_and_uploaded: { label: "Delivered", className: "border-green-400/30 bg-green-400/15 text-green-300" },
};

type OngoingTask = { id: string; title: string; status: TaskStatus; frameioLink: string | null; subtitle: string };

// The work in flight, read-only, laid out like the team's own ongoing list:
// what it is, where it is, and the review link when it's the client's turn.
export function OngoingList({ tasks, empty = "Nothing in production right now." }: { tasks: OngoingTask[]; empty?: string }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm text-muted">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((t) => {
        const stage = STAGE[t.status] ?? STAGE.editing!;
        const review = t.status === "sent_for_client_approval" && t.frameioLink ? normalizeUrl(t.frameioLink) : null;
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{t.title}</span>
              <span className="block truncate text-xs text-muted">{t.subtitle}</span>
            </span>
            {review && (
              <a href={review} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 whitespace-nowrap text-xs text-blue-400 hover:underline">
                Review on Frame.io <ExternalLink size={11} />
              </a>
            )}
            <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${stage.className}`}>{stage.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
