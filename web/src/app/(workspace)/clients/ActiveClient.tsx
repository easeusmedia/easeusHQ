"use client";

import { useEffect } from "react";
import { setActiveClient } from "./clientsPanel";

// Tells the clients roster which client this page belongs to, for pages whose
// address doesn't (a project's). Renders nothing.
export function ActiveClient({ slug }: { slug: string }) {
  useEffect(() => {
    setActiveClient(slug);
    return () => setActiveClient(null);
  }, [slug]);
  return null;
}
