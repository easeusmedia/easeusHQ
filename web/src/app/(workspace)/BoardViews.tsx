"use client";

import { useSearchParams } from "next/navigation";
import { EditorsView } from "./EditorsView";
import type { Column } from "./Board";
import { STAGE, stageLabel } from "@/lib/stages";
import { WORKFLOW_STAGES } from "@/lib/workflow";
import { NotionSyncButton } from "./NotionSyncButton";
import { ScopeToggle } from "./ScopeToggle";

type EditorsProps = Omit<React.ComponentProps<typeof EditorsView>, "switcher" | "columns">;

// the design queue's columns: its own stages, by its own names, up to done
const DESIGN_COLUMNS: Column[] = WORKFLOW_STAGES.design
  .filter((s) => s !== "delivered_and_uploaded")
  .map((status) => ({ status, label: stageLabel(status, "design"), dot: STAGE[status].dot }));

// Production's two queues, Video and Design, already loaded and switched
// here in the browser. The choice goes in the address (?scope=), so Back and
// links work.
export function BoardViews({
  scopes,
  initialScope,
  editors,
  design,
  canSyncNotion,
}: {
  scopes: { key: string; label: string }[];
  initialScope: string;
  editors: EditorsProps;
  design: EditorsProps;
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

  return (
    <>
      {/* both kept mounted, so each keeps its own Board/List */}
      <div hidden={scope !== "editors"}>
        <EditorsView {...editors} switcher={switcher} />
        {scope === "editors" && canSyncNotion && <NotionSyncButton />}
      </div>
      <div hidden={scope !== "design"}>
        <EditorsView {...design} columns={DESIGN_COLUMNS} workflow="design" switcher={switcher} />
      </div>
    </>
  );
}
