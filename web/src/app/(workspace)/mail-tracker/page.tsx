import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRealViewer } from "@/lib/auth";
import { trackerKey } from "@/lib/mailTrack";
import { TrackerStatus } from "./TrackerStatus";

export const dynamic = "force-dynamic";

// Setting up the mail tracker (lib/mailTrack.ts) on this computer. The page
// carries the signed-in person's key, which the extension picks up by
// itself; always the real person's, even in View as.
export default async function MailTrackerPage() {
  const me = await getRealViewer();
  if (!me) redirect("/login");
  const tracked = await prisma.trackedMail.groupBy({ by: ["from"], where: { userId: me.id }, _count: true, _max: { sentAt: true }, orderBy: { from: "asc" } });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <span hidden data-tracker-key={trackerKey(me.id)} />
      <h1 className="text-2xl font-semibold tracking-tight">Mail tracker</h1>
      <TrackerStatus
        tracked={tracked.map((t) => ({ from: t.from, count: t._count, last: t._max.sentAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
