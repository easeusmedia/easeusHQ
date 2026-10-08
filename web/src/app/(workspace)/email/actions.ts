"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getRealViewer } from "@/lib/auth";
import { seesSalesMail } from "@/lib/scope";
import { trashFile } from "@/lib/drive";
import { DOC_ID, docUploadUrl, newDocId } from "@/lib/docTrack";

const MAX_MB = 25;

async function allowed() {
  const me = await getRealViewer();
  return me && seesSalesMail(me) ? me : null;
}

// A tracked PDF, step one: where the browser uploads it, straight to Drive
export async function startPdfUpload(name: string, size: number): Promise<{ id?: string; url?: string; error?: string }> {
  if (!(await allowed())) return { error: "Only Sales can add a PDF." };
  if (!/\.pdf$/i.test(name)) return { error: "Choose a PDF." };
  if (!(size > 0) || size > MAX_MB * 1024 * 1024) return { error: `A PDF can be up to ${MAX_MB} MB.` };
  try {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    return { id: newDocId(), url: await docUploadUrl({ name, size }, origin) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Google Drive couldn't take the PDF." };
  }
}

// Step two, once Drive has it: the PDF is ready to send
export async function finishPdfUpload(id: string, name: string, size: number, driveFileId: string): Promise<{ error?: string }> {
  const me = await allowed();
  if (!me) return { error: "Only Sales can add a PDF." };
  if (!DOC_ID.test(id) || !/^[\w-]{10,}$/.test(driveFileId)) return { error: "That upload couldn't be read." };
  await prisma.trackedDoc.create({ data: { id, name: name.slice(0, 200), size: Math.round(size), driveFileId, createdById: me.id } });
  revalidatePath("/email");
  return {};
}

// Gone from the app, and into Drive's trash; its link stops working
export async function deletePdf(id: string): Promise<{ error?: string }> {
  if (!(await allowed())) return { error: "Only Sales can delete a PDF." };
  const doc = await prisma.trackedDoc.findUnique({ where: { id }, select: { driveFileId: true } });
  if (!doc) return {};
  await prisma.trackedDoc.delete({ where: { id } });
  await trashFile(doc.driveFileId).catch(() => {});
  revalidatePath("/email");
  return {};
}
