import Link from "next/link";
import type { WorkTaskStatus } from "@prisma/client";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { Avatar } from "../TaskCard";
import { TaskTagChip } from "../TaskTagPicker";

export type ClientWorkTask = {
  id: string;
  title: string;
  status: WorkTaskStatus;
  projectName: string | null;
  assignee: { name: string } | null;
  tags: string[];
};

// Work tasks attached to one of this client's projects.
//
// These are a different system from the editing queue — a thumbnail, an audio
// pass, a round of channel admin — with their own four stages rather than the
// client-approval pipeline. They were invisible on the client's page, which
// meant work genuinely being done for a client simply didn't appear anywhere
// on that client's record. Listed apart from the queue rather than merged
// into it, because the two use different stages and merging them would make
// "Sent for client approval" and "In review" look like the same kind of
// thing.
export function ClientWorkTasks({ tasks }: { tasks: ClientWorkTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-sm font-medium">Team tasks</h2>
      <p className="mb-3 text-xs text-muted">
        Work the team is doing on this client outside the editing queue — thumbnails, audio, channel admin.
      </p>
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href="/tasks/my"
              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-left hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{t.title}</span>
                {t.projectName && <span className="block truncate text-xs text-muted">{t.projectName}</span>}
              </span>

              {t.tags.length > 0 && (
                <span className="hidden shrink-0 items-center gap-1 sm:flex">
                  {t.tags.map((tag) => (
                    <TaskTagChip key={tag} name={tag} />
                  ))}
                </span>
              )}

              {t.assignee && <Avatar name={t.assignee.name} size={22} />}
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${WORK_TASK_STAGE[t.status].pill}`}
              >
                {WORK_TASK_STAGE[t.status].label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
