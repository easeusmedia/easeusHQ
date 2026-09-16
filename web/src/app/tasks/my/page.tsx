import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { loadWork } from "../workData";
import { WorkTaskView } from "./WorkTaskView";
import { WorkNotionSyncButton } from "./WorkNotionSyncButton";

export const dynamic = "force-dynamic";

// Your own tasks, as a status board.
//
// For a while this page also showed a whole team's work, and everyone's.
// With the editing board next door that made two places to look for the
// same thing, so the team-wide picture moved to the Board's Organization
// tab and this went back to being only yours.
export default async function MyTasksPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: sessionUserId },
    include: { team: true },
  });
  if (!me) redirect("/login");

  const work = await loadWork({ id: me.id, role: me.role, email: me.email, teamId: me.teamId }, "mine", { withQueue: false });

  return (
    <WorkTaskView
      tasks={work.tasks}
      queueTasks={[]}
      groupOptions={["status"]}
      teams={[]}
      roles={[]}
      projects={work.projects}
      actingUserId={me.id}
      showAssignee={false}
      canCreate
      assignees={work.assignable}
      taskTags={work.taskTags}
      canManageTags={me.role !== "employee"}
      toolbarRight={
        // anyone whose work has a home in Notion — a core member with their
        // own workbook, or Operations
        me.role !== "employee" &&
        (!!me.notionWorkbookDbId || me.team?.slug === "operations") && <WorkNotionSyncButton />
      }
    />
  );
}
