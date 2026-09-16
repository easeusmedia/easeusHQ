import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { normalizeUrl } from "@/lib/links";
import { ProjectFiles } from "../../../../(workspace)/projects/ProjectFiles";
import { OngoingList, sharedClient } from "../../shared";

// One project on a client's shared page, at /clients/<name>/projects/<id>
// (see proxy.ts) — the team's project page, read-only: its cover, where it
// stands, what's still being made for it, and every file it produced.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const client = await sharedClient(slug);
  const project = client ? await prisma.project.findFirst({ where: { id, clientId: client.id }, select: { name: true, type: true } }) : null;
  return {
    title: client && project ? `${project.name || project.type} · ${client.name} · Easeus Media` : "Easeus Media",
    // a private link: keep it out of search engines
    robots: { index: false, follow: false },
  };
}

export default async function SharedProjectPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const client = await sharedClient(slug);
  const project = client
    ? await prisma.project.findFirst({
        where: { id, clientId: client.id },
        include: {
          assets: { orderBy: { sortOrder: "asc" } },
          tasks: {
            where: { status: { in: ACTIVE_STATUSES }, internal: false },
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, status: true, frameioLink: true },
          },
        },
      })
    : null;
  if (!client || !project) redirect("/login");

  const folder = project.driveLink ? normalizeUrl(project.driveLink) : null;
  const name = project.name || project.type;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/clients/${client.slug}`} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> {client.name}
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-80">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img src={project.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">No cover</div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {project.status === "completed" ? (
              <span className="rounded-full border border-green-400/30 bg-green-400/15 px-2 py-0.5 text-xs font-medium text-green-300">
                Delivered{project.completedAt ? ` · ${project.completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </span>
            ) : (
              <span className="rounded-full border border-blue-400/30 bg-blue-400/15 px-2 py-0.5 text-xs font-medium text-blue-300">In progress</span>
            )}
            {folder && (
              <a href={folder} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                Open folder <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>

      {project.tasks.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-medium">Ongoing work</h2>
          <OngoingList tasks={project.tasks.map((t) => ({ ...t, subtitle: name }))} />
        </section>
      )}

      <ProjectFiles
        projectId={project.id}
        assets={project.assets.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, link: a.link ? normalizeUrl(a.link) : null }))}
        readOnly
      />
    </div>
  );
}
