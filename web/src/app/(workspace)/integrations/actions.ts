"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, driveSettings, folder, parentFolderId, saveDriveSettings } from "@/lib/drive";

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

// The folder new client folders are made in — pasted as a Drive link, which
// is what the browser's address bar gives you.
export async function saveDriveFolder(link: string): Promise<{ error?: string; name?: string }> {
  if (!(await requireAdmin())) return { error: "Only an admin can change this." };
  const id = link.trim().match(/[-\w]{25,}/)?.[0];
  if (!id) return { error: "That doesn't look like a Drive folder link." };
  await saveDriveSettings({ [DRIVE_SETTINGS.folderId]: id });

  // confirm we can actually see it, and remember what it's called
  try {
    const name = await folderName(id);
    await saveDriveSettings({ [DRIVE_SETTINGS.folderName]: name });
    revalidatePath("/integrations");
    return { name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't open that folder." };
  }
}

async function folderName(id: string): Promise<string> {
  const { driveFileName } = await import("@/lib/drive");
  return driveFileName(id);
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
