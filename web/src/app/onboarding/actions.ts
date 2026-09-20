"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { firstFree, slugify } from "@/lib/slug";
import { isStorablePicture } from "@/lib/photos";
import { normalizeUrl } from "@/lib/links";
import { clientFolder, driveConfigured, uploadFile } from "@/lib/drive";

// Onboarding a new client: ops makes a link, the client fills it in, and
// their record here is created from what they wrote. No account for them, no
// password — the token in the link is the permission, and it stops working
// once it's been used.

export async function createClientInvite(name: string): Promise<{ token?: string; error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can onboard a client." };
  const invite = await prisma.clientInvite.create({
    data: { token: randomBytes(24).toString("base64url"), name: name.trim() || null, createdById: user.id },
  });
  revalidatePath("/clients");
  return { token: invite.token };
}

export async function deleteClientInvite(id: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can do that." };
  await prisma.clientInvite.delete({ where: { id } });
  revalidatePath("/clients");
  return {};
}

// What the form sends. Files arrive as bytes rather than links because the
// point is that the client doesn't have to host them anywhere — see
// lib/drive.ts for where they end up.
export type OnboardingInput = {
  token: string;
  name: string;
  niche: string;
  contact: string;
  email: string;
  whatsapp: string;
  address: string;
  logo: string | null; // small data: URI, resized in the browser
  socials: { label: string; url: string }[];
  assetsLink: string; // used when Drive isn't connected yet
  files: { name: string; type: string; data: string }[]; // data: base64
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export async function submitOnboarding(input: OnboardingInput): Promise<{ slug?: string; error?: string; warning?: string }> {
  const invite = await prisma.clientInvite.findUnique({ where: { token: String(input.token ?? "") } });
  if (!invite) return { error: "This link isn't valid. Ask your contact at Easeus for a new one." };
  if (invite.usedAt) return { error: "This form has already been filled in. Get in touch if something needs changing." };

  const name = input.name?.trim();
  if (!name) return { error: "Please give your brand or business name." };
  if (input.logo && !isStorablePicture(input.logo)) return { error: "That logo couldn't be read — try a JPEG or PNG." };

  const files = (input.files ?? []).slice(0, 20);
  const bytesOf = (f: { data: string }) => Buffer.from((f.data ?? "").split(",").pop() ?? "", "base64");
  let total = 0;
  for (const f of files) {
    const size = bytesOf(f).length;
    total += size;
    if (size > MAX_FILE_BYTES) return { error: `"${f.name}" is bigger than 25MB — send that one to us directly.` };
  }
  if (total > MAX_TOTAL_BYTES) return { error: "That's more than 100MB in one go — send the rest to us directly." };

  const socials = (input.socials ?? [])
    .map((s) => ({ label: s.label?.trim() || "Link", url: normalizeUrl(s.url ?? "") ?? "" }))
    .filter((s) => s.url);

  // the client record itself, before anything is uploaded: if Drive is
  // having a bad day the onboarding still lands and the files can follow
  const slug = firstFree(
    slugify(name),
    new Set((await prisma.client.findMany({ select: { slug: true } })).map((c) => c.slug))
  );
  const client = await prisma.client.create({
    data: {
      name,
      slug,
      status: "current",
      niche: input.niche?.trim() || null,
      contact: input.contact?.trim() || null,
      email: input.email?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      address: input.address?.trim() || null,
      avatarUrl: input.logo,
      socialLinks: socials.length ? socials : undefined,
      resources: input.assetsLink?.trim() ? `Brand assets: ${input.assetsLink.trim()}` : null,
    },
  });

  let warning: string | undefined;
  if (files.length > 0) {
    if (!driveConfigured()) {
      warning = "We've saved your details. Our team will be in touch about the files.";
    } else {
      try {
        const { client: folder, target } = await clientFolder(name, "Brand assets");
        for (const f of files) {
          await uploadFile({ name: f.name, type: f.type, bytes: bytesOf(f) }, target.id);
        }
        await prisma.client.update({
          where: { id: client.id },
          data: { driveFolderId: folder.id, driveFolderUrl: folder.url },
        });
      } catch (err) {
        // their answers are saved either way; ops can see what went wrong
        warning = "We've saved your details, but the files didn't go through. Our team will follow up.";
        await prisma.client.update({
          where: { id: client.id },
          data: { notes: `Onboarding upload failed: ${err instanceof Error ? err.message : "unknown error"}` },
        });
      }
    }
  }

  await prisma.clientInvite.update({ where: { id: invite.id }, data: { usedAt: new Date(), clientId: client.id } });
  revalidatePath("/clients");
  return { slug, warning };
}
