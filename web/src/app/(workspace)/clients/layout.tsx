import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { seesClients } from "@/lib/scope";

// Sales alone doesn't work on clients: the whole area sends them home
export default async function ClientsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer && !seesClients(viewer)) redirect("/home");
  return children;
}
