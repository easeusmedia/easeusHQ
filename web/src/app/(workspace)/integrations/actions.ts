"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, driveSettings, folder, parentFolderId, saveDriveSettings } from "@/lib/drive";
import { FRAMEIO_SETTINGS, accounts, saveFrameioSettings, shareFiles, shareIdFrom } from "@/lib/frameio";

// Connecting the team's Google Drive, from inside the app rather than from
// deploy settings — see lib/drive.ts. Admin and Abhishek only: this is the
// company's Drive, and the connection uploads on their behalf.
async function requireAdmin() {
  const id = await getSessionUserId();
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
  return user && isAbhishekOrAdmin(user) ? user : null;
}

export async function saveGoogleApp(clientId: string, clientSecret: string): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  if (!clientId.trim() || !clientSecret.trim()) return { error: "Both the client ID and secret are needed." };
  await saveDriveSettings({
    [DRIVE_SETTINGS.clientId]: clientId.trim(),
    [DRIVE_SETTINGS.clientSecret]: clientSecret.trim(),
  });
  revalidatePath("/integrations");
  return {};
}

// The folder client folders are created in — pasted as a Drive link, which
// is what the browser's address bar gives you.
export async function saveDriveFolder(link: string): Promise<{ error?: string; name?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  const id = link.trim().match(/[-\w]{25,}/)?.[0];
  if (!id) return { error: "That doesn't look like a Drive folder link." };
  await saveDriveSettings({ [DRIVE_SETTINGS.folderId]: id });
  try {
    const { driveFileName } = await import("@/lib/drive");
    const name = await driveFileName(id);
    await saveDriveSettings({ [DRIVE_SETTINGS.folderName]: name });
    revalidatePath("/integrations");
    return { name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't open that folder." };
  }
}

export async function disconnectGoogle(): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  await saveDriveSettings({
    [DRIVE_SETTINGS.refreshToken]: null,
    [DRIVE_SETTINGS.account]: null,
  });
  revalidatePath("/integrations");
  return {};
}

// A folder made in the real parent, then removed — proof the whole path
// works before a client ever uses it.
export async function testDrive(): Promise<{ ok?: string; error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can do that." };
  try {
    const parent = await parentFolderId();
    const made = await folder("Easeus HQ connection test", parent);
    const { deleteFile } = await import("@/lib/drive");
    await deleteFile(made.id);
    const settings = await driveSettings();
    return { ok: `Working — files will land in ${settings[DRIVE_SETTINGS.folderName] ?? "the chosen folder"}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That didn't work." };
  }
}

// ---- Frame.io ----
//
// Same admin bar as the Drive connection above, and the same shape: consent
// happens in the browser, everything lasting is kept server-side.

export async function listFrameioAccounts(): Promise<{ accounts?: { id: string; name: string }[]; error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  try {
    return { accounts: await accounts() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach Frame.io." };
  }
}

export async function chooseFrameioAccount(accountId: string): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  const known = await accounts().catch(() => []);
  if (!known.some((a) => a.id === accountId)) return { error: "That isn't one of this login's accounts." };
  await saveFrameioSettings({ [FRAMEIO_SETTINGS.accountId]: accountId });
  revalidatePath("/integrations");
  return {};
}

export async function disconnectFrameio(): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  // the app's own credentials stay; only the connection goes
  await saveFrameioSettings({
    [FRAMEIO_SETTINGS.refreshToken]: null,
    [FRAMEIO_SETTINGS.account]: null,
    [FRAMEIO_SETTINGS.accountId]: null,
  });
  revalidatePath("/integrations");
  return {};
}

// Proves the whole path end to end, against work we actually hold: take a
// task's review link, resolve the share, and report what's inside it.
export async function testFrameio(): Promise<{ ok?: string; error?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can do that." };
  try {
    const task = await prisma.task.findFirst({
      where: { frameioLink: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { title: true, frameioLink: true },
    });
    if (!task?.frameioLink) return { error: "No task here has a Frame.io link to test with." };

    const shareId = await shareIdFrom(task.frameioLink);
    if (!shareId) return { error: `Couldn't resolve ${task.frameioLink} to a share.` };

    const files = await shareFiles(shareId);
    if (files.length === 0) return { error: `Reached Frame.io, but "${task.title}" has no files in its share.` };
    const f = files[0];
    const mb = f.size ? `${(f.size / 1024 / 1024).toFixed(0)}MB` : "size unknown";
    const res = f.width && f.height ? `${f.width}×${f.height}` : "resolution unknown";
    return { ok: `Working — "${task.title}" → ${f.name} (${res}, ${mb}).` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That didn't work." };
  }
}
