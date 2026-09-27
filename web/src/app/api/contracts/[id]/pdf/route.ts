import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { compose, withDefaults, type Clause } from "@/lib/contract";
import { contractPdf } from "@/lib/contractPdf";
import { signedPdf } from "@/lib/adobeSign";

// A contract as a PDF, for ops: as it stands now, (?sign) ready to upload
// to Acrobat for e-signing, or (?signed=1) the copy everyone has signed,
// straight from Adobe Acrobat Sign.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOps())) return new Response("Not allowed", { status: 403 });
  const contract = await prisma.contract.findUnique({ where: { id: (await params).id } });
  if (!contract) return new Response("Not found", { status: 404 });

  const details = withDefaults(contract.details);
  const name = `Service Agreement - ${details.entity || contract.name || "Draft"}`.replace(/[\\/:*?"<>|]/g, "");
  let pdf: Uint8Array;
  const query = new URL(request.url).searchParams;
  if (query.has("signed") && contract.agreementId) {
    pdf = new Uint8Array(await signedPdf(contract.agreementId));
  } else {
    // ?sign: the copy to upload to Acrobat's Request e-signatures — its
    // signature and date lines carry Acrobat Sign's field tags
    const { sections, values } = compose(contract.clauses as Clause[], details, indiaDay(new Date()));
    pdf = await contractPdf({ sections, values, details, tags: query.has("sign") });
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.has("sign") ? "attachment" : "inline"}; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
