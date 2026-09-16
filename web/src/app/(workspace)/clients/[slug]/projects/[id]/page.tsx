import { redirect } from "next/navigation";

// The address a client's shared page gives a project. Someone signed in
// gets the team's page for it instead.
export default async function ClientProjectAddress({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/projects/${(await params).id}`);
}
