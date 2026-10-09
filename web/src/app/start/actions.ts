"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currencyOf, EMAIL, PROVIDER, withDefaults } from "@/lib/contract";
import { acknowledgement, mime } from "@/lib/contractAck";
import { sendMail } from "@/lib/gmail";

// The client's side of a new contract: the form at /start/<token>. No
// sign-in — the token in the link is the permission, and it stops working
// once the form has been sent (or ops has taken the contract further).

export type IntakeInput = {
  contactName: string;
  contactEmail: string;
  whatsapp: string;
  entity: string;
  country: string;
  address: string;
  // the country's ISO code, from the form's own list (its currency)
  countryCode: string;
  // the signatory, when it isn't the person filling this in
  signatory: { name: string; email: string } | null;
  // Net banking, Credit card, or their own words
  paymentMethod: string;
};

const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

// Saved, then the client is emailed a copy (their acknowledgement) from
// easeus.media@gmail.com; `acknowledged` is where it went, when it went.
export async function submitIntake(token: string, input: IntakeInput): Promise<{ error?: string; acknowledged?: string }> {
  const contract = await prisma.contract.findUnique({ where: { token }, omit: { signedPdf: true } });
  if (!contract || contract.status !== "invited") return { error: "This link has already been used. Please ask your contact at Easeus Media for a new one." };

  const form = {
    contactName: text(input.contactName, 120),
    contactEmail: text(input.contactEmail, 200),
    whatsapp: text(input.whatsapp, 40),
    entity: text(input.entity, 200),
    country: text(input.country, 80),
    address: text(input.address, 500),
    signatory: input.signatory ? { name: text(input.signatory.name, 120), email: text(input.signatory.email, 200) } : null,
    paymentMethod: text(input.paymentMethod, 80),
  };
  const countryCode = /^[A-Z]{2}$/.test(input.countryCode ?? "") ? input.countryCode : "";
  if (!form.contactName || !EMAIL.test(form.contactEmail)) return { error: "Please enter your name and a valid email." };
  if (!form.entity || !form.country || !form.address) return { error: "Please enter your business name, country and address." };
  if (form.signatory && (!form.signatory.name || !EMAIL.test(form.signatory.email))) {
    return { error: "Please enter the signer's name and a valid email." };
  }
  if (!form.paymentMethod) return { error: "Please choose how you'll pay." };
  // the contract is written in their country's own currency
  const currency = currencyOf(countryCode, form.country);

  const details = withDefaults({
    ...withDefaults(contract.details),
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    whatsapp: form.whatsapp,
    entity: form.entity,
    country: form.country,
    address: form.address,
    signatories: [form.signatory ?? { name: form.contactName, email: form.contactEmail }],
    paymentMethod: form.paymentMethod,
    currency,
  });
  await prisma.contract.update({
    where: { id: contract.id },
    data: { intake: form, details, status: "draft", submittedAt: new Date() },
  });

  // their copy; whether it went (or why not) is kept with the form, for the
  // contract page. Their details are saved either way.
  const ack = acknowledgement(form, currency);
  const sent = await sendMail(mime({ from: `Easeus Media <${PROVIDER.email}>`, ...ack }));
  const at = new Date().toISOString();
  await prisma.contract.update({
    where: { id: contract.id },
    data: { intake: { ...form, ack: sent.error ? { error: sent.error, at } : { to: [...ack.to, ...ack.cc], at } } },
  });
  revalidatePath("/contracts", "layout");
  return sent.error ? {} : { acknowledged: ack.to[0] };
}
