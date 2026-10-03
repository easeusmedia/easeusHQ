import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, brandAssetsName, driveSettings } from "@/lib/drive";
import { NOTION_SETTINGS, clientDatabaseId, notionSettings, taskDatabaseId } from "@/lib/notion";
import { NotionIntegration } from "./NotionIntegration";
import { DriveIntegration } from "./DriveIntegration";
import { FRAMEIO_SETTINGS, frameioSettings } from "@/lib/frameio";
import { FrameioIntegration } from "./FrameioIntegration";
import { AnalyticsIntegration } from "./AnalyticsIntegration";
import { apifyAccount, apifyTokens } from "@/lib/apify";
import { ClaudeIntegration } from "./ClaudeIntegration";
import { GmailIntegration } from "./GmailIntegration";
import { CalendarIntegration } from "./CalendarIntegration";
import { calendarAccount } from "@/lib/googleCalendar";
import { gmailAccount } from "@/lib/gmail";
import { claudeKey } from "@/lib/claude";
import { AI_ADMIN_KEY, aiSpend } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Where the app is joined up to everything outside it, and every value that
// connection depends on — folders, databases, the Frame.io account — so any
// of them can be pointed somewhere new from here rather than in code.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; frameio?: string }>;
}) {
  const { connected, error, frameio } = await searchParams;
  const user = await getViewer();
  if (!user) redirect("/login");
  if (!isAbhishekOrAdmin(user)) redirect("/board");

  // every connection's settings side by side: nothing here waits on anything
  // else, and the Apify accounts are a call out to Apify each
  const [settings, fio, notion, brandAssets, taskDb, clientDb, apify, claude, aiAdmin, spend, gmail, calendar] = await Promise.all([
    driveSettings(),
    frameioSettings(),
    notionSettings(),
    brandAssetsName(),
    taskDatabaseId(),
    clientDatabaseId(),
    // each Apify account's name and credit left — never the tokens themselves
    apifyTokens().then((tokens) => Promise.all(tokens.map((t) => apifyAccount(t).catch(() => null)))),
    claudeKey(),
    prisma.appSetting.findUnique({ where: { key: AI_ADMIN_KEY } }),
    aiSpend(),
    gmailAccount(),
    calendarAccount(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted">The services Easeus HQ connects to.</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">

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

      <ClaudeIntegration
        ending={claude?.slice(-4) ?? null}
        adminEnding={aiAdmin?.value.slice(-4) ?? null}
        spend={spend}
      />

      <GmailIntegration account={gmail} clientId={settings[DRIVE_SETTINGS.clientId] ?? ""} />

      <CalendarIntegration account={calendar} clientId={settings[DRIVE_SETTINGS.clientId] ?? ""} />

      <AnalyticsIntegration apifyAccounts={apify.map((a) => a ?? { username: "Not accepted", left: null })} />

      <NotionIntegration
        tasks={{ id: taskDb, name: notion[NOTION_SETTINGS.taskDatabaseName] ?? null }}
        clients={{ id: clientDb, name: notion[NOTION_SETTINGS.clientDatabaseName] ?? null }}
      />
      </div>
    </div>
  );
}
