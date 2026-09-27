import { CircleCheck, Clapperboard, ListChecks, Receipt } from "lucide-react";
import { StatTile } from "../StatTile";

// The four numbers the daily client review actually asks for, big enough to
// read at a glance without opening anything. Everything else on the page is
// one tab away.
export function ClientStats({
  activeTasks,
  inProgress,
  completed,
  unpaid,
}: {
  activeTasks: number;
  inProgress: number;
  completed: number;
  unpaid: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Active tasks" value={activeTasks} Icon={ListChecks} />
      <StatTile label="Projects in progress" value={inProgress} Icon={Clapperboard} />
      <StatTile label="Projects delivered" value={completed} Icon={CircleCheck} tone="emerald" />
      <StatTile label="Unpaid" value={unpaid} Icon={Receipt} />
    </div>
  );
}
