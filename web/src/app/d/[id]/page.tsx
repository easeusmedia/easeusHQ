import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DOC_ID } from "@/lib/docTrack";
import { PdfViewer } from "./PdfViewer";

export const dynamic = "force-dynamic";

async function load(id: string) {
  return DOC_ID.test(id) ? prisma.trackedDoc.findUnique({ where: { id }, select: { id: true, name: true } }) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const doc = await load((await params).id);
  return { title: doc?.name ?? "PDF", robots: { index: false, follow: false } };
}

// A tracked PDF, as whoever it was sent to reads it (lib/docTrack.ts)
export default async function TrackedPdfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const doc = await load((await params).id);
  if (!doc) notFound();
  return <PdfViewer id={doc.id} name={doc.name} mailId={(await searchParams).m ?? null} />;
}
