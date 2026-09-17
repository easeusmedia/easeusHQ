"use client";

import { useSearchParams } from "next/navigation";
import { EditorsView } from "./EditorsView";
import { NotionSyncButton } from "./NotionSyncButton";
import { ScopeToggle } from "./ScopeToggle";
import { WorkTaskView } from "./my-tasks/WorkTaskView";
import type { GroupBy } from "@/lib/workTaskStages";
import type { WorkTaskCardData } from "./my-tasks/WorkTaskCard";
import type { QueueCardData, QueueEnv } from "./my-tasks/grouping";

type EditorsProps = Omit<React.ComponentProps<typeof EditorsView>, "switcher">;

// Everything the Board shows, already loaded, switched here in the browser.
// Changing Editors / a team / Everyone used to be a trip to the server and a
// visible wait; now it's the same data, filtered, the moment you click. The
// choice still goes in the address (?scope=), so Back and links work.
export function BoardViews({
  scopes,
  initialScope,
  editors,
  work,
  canSyncNotion,
}: {
  scopes: { key: string; label: string }[];
  initialScope: string;
  editors: EditorsProps;
  // the widest work this person may see; teams are filtered out of it
  work: {
    tasks: WorkTaskCardData[];
    queueTasks: QueueCardData[];
    queueEnv: QueueEnv;
    teams: { slug: string; name: string }[];
    projects: { id: string; name: string; client: { id: string; name: string } }[];
    assignable: { id: string; name: string }[];
    taskTags: { id: string; name: string; clientFacing: boolean }[];
  } | null;
  canSyncNotion: boolean;
}) {
  const params = useSearchParams();
  const wanted = params.get("scope");
  const scope = scopes.some((s) => s.key === wanted) ? wanted! : initialScope;

  function select(key: string) {
    const next = new URLSearchParams(params);
    next.set("scope", key);
    // Next keeps its router in step with pushState, so this is a real
    // history entry without a round trip
    window.history.pushState(null, "", `?${next.toString()}`);
  }

  const switcher = scopes.length > 1 && <ScopeToggle options={scopes} active={scope} onSelect={select} />;
  const inScope = (team?: { slug: string } | null) => scope === "all" || scope === "mine" || team?.slug === scope;
  const groupOptions: GroupBy[] = scope === "all" ? ["person", "team"] : ["person"];

  return (
    <>
      {/* both kept mounted, so each keeps its own Board/List and grouping */}
      <div hidden={scope !== "editors"}>
        <EditorsView {...editors} switcher={switcher} />
        {scope === "editors" && canSyncNotion && <NotionSyncButton />}
      </div>
      {work && (
        <div hidden={scope === "editors"}>
          <WorkTaskView
            tasks={work.tasks.filter((t) => inScope(t.assignedTo.team))}
            queueTasks={work.queueTasks.filter((t) => inScope(t.assignedTo?.team))}
            queueEnv={work.queueEnv}
            groupOptions={groupOptions}
            teams={work.teams}
            projects={work.projects}
            actingUserId={editors.actingUserId}
            showAssignee
            canCreate
            assignees={work.assignable}
            taskTags={work.taskTags}
            canManageTags
            toolbarCenter={switcher}
            contentKey={scope}
          />
        </div>
      )}
    </>
  );
}
