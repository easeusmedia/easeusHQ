"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { EMAIL, PLATFORMS, withDefaults } from "@/lib/contract";

// The client's side of a new contract: the form at /start/<token>. No
// sign-in — the token in the link is the permission, and it stops working
// once the form has been sent (or ops has taken the contract further).

export type IntakeInput = {
  contactName: string;
  contactEmail: string;
  whatsapp: string;
  entity: string;
  tradingName: string;
  country: string;
  address: string;
  podcastName: string;
  platforms: string[];
  // the signatory, when it isn't the person filling this in
  signatory: { name: string; email: string } | null;
  second: { name: string; email: string } | null;
};

const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export async function submitIntake(token: string, input: IntakeInput): Promise<{ error?: string }> {
  const contract = await prisma.contract.findUnique({ where: { token } });
  if (!contract || contract.status !== "invited") return { error: "This link has already been used — ask your contact at Easeus for a new one." };

  const person = (p: { name: string; email: string } | null) =>
    p && (text(p.name) || text(p.email)) ? { name: text(p.name, 120), email: text(p.email, 200) } : null;
  const form = {
    contactName: text(input.contactName, 120),
    contactEmail: text(input.contactEmail, 200),
    whatsapp: text(input.whatsapp, 40),
    entity: text(input.entity, 200),
    tradingName: text(input.tradingName, 200),
    country: text(input.country, 80),
    address: text(input.address, 500),
    podcastName: text(input.podcastName, 200),
    platforms: (Array.isArray(input.platforms) ? input.platforms : []).map(String).filter((p) => PLATFORMS.includes(p)),
    signatory: person(input.signatory),
    second: person(input.second),
  };
  if (!form.contactName || !EMAIL.test(form.contactEmail)) return { error: "Your name and a valid email are needed." };
  if (!form.entity || !form.country || !form.address) return { error: "Your business name, country and address are needed." };
  for (const p of [form.signatory, form.second]) {
    if (p && (!p.name || !EMAIL.test(p.email))) return { error: "Each person signing needs a name and a valid email." };
  }

  const first = form.signatory ?? { name: form.contactName, email: form.contactEmail };
  const details = withDefaults({
    ...withDefaults(contract.details),
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    whatsapp: form.whatsapp,
    entity: form.entity,
    tradingName: form.tradingName,
    country: form.country,
    address: form.address,
    podcastName: form.podcastName,
    platforms: form.platforms,
    signatories: form.second ? [first, form.second] : [first],
  });
  await prisma.contract.update({
    where: { id: contract.id },
    data: { intake: form, details, status: "draft", submittedAt: new Date() },
  });
  revalidatePath("/contracts", "layout");
  return {};
}
