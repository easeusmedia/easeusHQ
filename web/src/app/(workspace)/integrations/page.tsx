import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, brandAssetsName, driveSettings } from "@/lib/drive";
import { NOTION_SETTINGS, clientDatabaseId, notionSettings, taskDatabaseId } from "@/lib/notion";
import { NotionIntegration } from "./NotionIntegration";
import { DriveIntegration } from "./DriveIntegration";
import { FRAMEIO_SETTINGS, frameioSettings } from "@/lib/frameio";
import { FrameioIntegration } from "./FrameioIntegration";
import { AnalyticsIntegration } from "./AnalyticsIntegration";
import { apifyAccount, apifyTokens } from "@/lib/instagram";
import { YOUTUBE_SETTINGS, youtubeSettings } from "@/lib/youtube";

export const dynamic = "force-dynamic";

// Where the app is joined up to everything outside it, and every value that
// connection depends on — folders, databases, the Frame.io account — so any
// of them can be pointed somewhere new from here rather than in code.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; frameio?: string; analytics?: string; analyticsError?: string }>;
}) {
  const { connected, error, frameio, analytics, analyticsError } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (!user || !isAbhishekOrAdmin(user)) redirect("/board");

  const [settings, fio, notion, brandAssets, taskDb, clientDb] = await Promise.all([
    driveSettings(),
    frameioSettings(),
    notionSettings(),
    brandAssetsName(),
    taskDatabaseId(),
    clientDatabaseId(),
  ]);
  const [tokens, yt] = await Promise.all([apifyTokens(), youtubeSettings()]);
  // each Apify account's name and credit left — never the tokens themselves
  const apify = await Promise.all(tokens.map((t) => apifyAccount(t).catch(() => null)));

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
        exportsName={settings[DRIVE_SETTINGS.exportsFolderName] ?? null}
        exportsId={settings[DRIVE_SETTINGS.exportsFolderId] ?? null}
        brandAssets={brandAssets}
        clientId={settings[DRIVE_SETTINGS.clientId] ?? ""}
        justConnected={connected === "1"}
        problem={error ?? null}
      />

      <FrameioIntegration
        hasApp={!!fio[FRAMEIO_SETTINGS.clientId] && !!fio[FRAMEIO_SETTINGS.clientSecret]}
        connected={!!fio[FRAMEIO_SETTINGS.refreshToken]}
        account={fio[FRAMEIO_SETTINGS.account] ?? null}
        accountId={fio[FRAMEIO_SETTINGS.accountId] ?? null}
        accountName={fio[FRAMEIO_SETTINGS.accountName] ?? null}
        clientId={fio[FRAMEIO_SETTINGS.clientId] ?? ""}
        justConnected={frameio === "1"}
      />

      <AnalyticsIntegration
        googleReady={!!settings[DRIVE_SETTINGS.clientId] && !!settings[DRIVE_SETTINGS.clientSecret]}
        youtubeAccount={yt[YOUTUBE_SETTINGS.refreshToken] ? yt[YOUTUBE_SETTINGS.account] || "connected" : null}
        youtubeViaServiceAccount={!!process.env.GOOGLE_SERVICE_ACCOUNT_JSON}
        apifyAccounts={apify.map((a) => a ?? { username: "Not accepted", left: null })}
        justConnected={analytics ?? null}
        problem={analyticsError ?? null}
      />

      <NotionIntegration
        tasks={{ id: taskDb, name: notion[NOTION_SETTINGS.taskDatabaseName] ?? null }}
        clients={{ id: clientDb, name: notion[NOTION_SETTINGS.clientDatabaseName] ?? null }}
      />
    </div>
  );
}
