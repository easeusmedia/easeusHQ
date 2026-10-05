import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { agreementName, compose, withDefaults, type Clause } from "@/lib/contract";
import { contractPdf } from "@/lib/contractPdf";

// A contract as a PDF, for ops: as it stands now, (?sign) as a download to
// drop into Acrobat's Request e-signatures, or (?signed=1) the signed copy
// that came with Adobe's "Signed and Filed" email.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOps())) return new Response("Not allowed", { status: 403 });
  const contract = await prisma.contract.findUnique({ where: { id: (await params).id }, omit: { signedPdf: false } });
  if (!contract) return new Response("Not found", { status: 404 });

  const details = withDefaults(contract.details);
  // the name Acrobat then gives the agreement, which its emails carry
  const name = agreementName(details, contract.name);
  let pdf: Uint8Array;
  const query = new URL(request.url).searchParams;
  if (query.has("signed") && contract.signedPdf) {
    // the copy Adobe emailed once everyone had signed
    pdf = new Uint8Array(contract.signedPdf);
  } else {
    // ?sign: the copy to drop into Acrobat's Request e-signatures
    const { sections, values } = compose(contract.clauses as Clause[], details, indiaDay(new Date()));
    pdf = await contractPdf({ sections, values, details });
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.has("sign") ? "attachment" : "inline"}; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
