import { greetingName } from "./contract.ts";

// The email a client gets once they've sent the contract form, from
// easeus.media@gmail.com: thanks, a copy of what they sent, and what happens
// next. Written here as a whole message (the format Gmail sends), so it can
// be checked without sending anything.

export type Intake = {
  contactName: string;
  contactEmail: string;
  whatsapp: string;
  entity: string;
  country: string;
  address: string;
  signatory: { name: string; email: string } | null;
  paymentMethod: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function acknowledgement(f: Intake, currency: string) {
  const first = greetingName(f.contactName) || "there";
  const signer = f.signatory ?? { name: f.contactName, email: f.contactEmail };
  const rows: [string, string][] = [
    ["Full name", f.contactName],
    ["Email", f.contactEmail],
    ["WhatsApp", f.whatsapp],
    ["Business name", f.entity],
    ["Country", f.country],
    ["Address", f.address],
    ["Signs the agreement", f.signatory ? `${signer.name} (${signer.email})` : "You"],
    ["Mode of payment", f.paymentMethod],
    ["Billing currency", currency],
  ].filter((r): r is [string, string] => !!r[1]);

  const subject = "We have your details for your Easeus Media agreement";
  const next = `We will now prepare your agreement and send it to ${signer.email} for e-signature through Adobe Acrobat Sign.`;
  const change = "If anything above needs changing, just reply to this email.";

  const text = [
    `Hi ${first},`,
    "Thank you for sending your details. Here is a copy for your records.",
    rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    `What happens next\n${next}`,
    change,
    "Kind regards,\nThe Easeus Media team",
  ].join("\n\n");

  const cell = "padding:8px 0;border-top:1px solid #e8eaee;font-size:14px;vertical-align:top;";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1f24;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
<tr><td>
<p style="margin:0 0 16px;font-size:13px;font-weight:600;letter-spacing:.02em;color:#4b95e6;">Easeus Media</p>
<p style="margin:0 0 12px;font-size:15px;">Hi ${esc(first)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Thank you for sending your details. Here is a copy for your records.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows.map(([k, v]) => `<tr><td style="${cell}color:#6b7280;width:42%;padding-right:12px;">${esc(k)}</td><td style="${cell}">${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:24px 0 6px;font-size:15px;font-weight:600;">What happens next</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">${esc(next)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;">${esc(change)}</p>
<p style="margin:0;font-size:15px;line-height:1.55;">Kind regards,<br>The Easeus Media team</p>
</td></tr>
</table>
</body></html>`;

  const to = [f.contactEmail];
  const cc = f.signatory && f.signatory.email.toLowerCase() !== f.contactEmail.toLowerCase() ? [f.signatory.email] : [];
  return { to, cc, subject, text, html };
}

// A whole email, plain text and HTML, ready for Gmail (base64url of this).
// Anything beyond plain ASCII in a header is encoded, as mail requires.
export function mime(m: { from: string; to: string[]; cc?: string[]; subject: string; text: string; html: string }): string {
  const header = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);
  const b64 = (v: string) => Buffer.from(v).toString("base64").replace(/.{76}/g, "$&\r\n");
  const boundary = `easeus-${Math.random().toString(36).slice(2)}`;
  return [
    `From: ${m.from}`,
    `To: ${m.to.join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    `Subject: ${header(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
