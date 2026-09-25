import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, driveSettings } from "@/lib/drive";
import { DriveIntegration } from "./DriveIntegration";
import { FRAMEIO_SETTINGS, frameioSettings } from "@/lib/frameio";
import { FrameioIntegration } from "./FrameioIntegration";

export const dynamic = "force-dynamic";

// Where the app is joined up to everything outside it. Google Drive is the
// first: onboarding uploads go straight into the team's own Drive.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; frameio?: string }>;
}) {
  const { connected, error, frameio } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (!user || !isAbhishekOrAdmin(user)) redirect("/board");

  const [settings, fio] = await Promise.all([driveSettings(), frameioSettings()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted">What Easeus HQ is connected to outside itself.</p>
      </div>

      <DriveIntegration
        hasApp={!!settings[DRIVE_SETTINGS.clientId] && !!settings[DRIVE_SETTINGS.clientSecret]}
        account={settings[DRIVE_SETTINGS.account] ?? null}
        connected={!!settings[DRIVE_SETTINGS.refreshToken]}
        folderName={settings[DRIVE_SETTINGS.folderName] ?? null}
        folderId={settings[DRIVE_SETTINGS.folderId] ?? null}
        clientId={settings[DRIVE_SETTINGS.clientId] ?? ""}
        justConnected={connected === "1"}
        problem={error ?? null}
      />

      <FrameioIntegration
        hasApp={!!fio[FRAMEIO_SETTINGS.clientId] && !!fio[FRAMEIO_SETTINGS.clientSecret]}
        connected={!!fio[FRAMEIO_SETTINGS.refreshToken]}
        account={fio[FRAMEIO_SETTINGS.account] ?? null}
        accountId={fio[FRAMEIO_SETTINGS.accountId] ?? null}
        accountName={null}
        clientId={fio[FRAMEIO_SETTINGS.clientId] ?? ""}
        justConnected={frameio === "1"}
      />
    </div>
  );
}
