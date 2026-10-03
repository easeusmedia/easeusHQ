"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

export type MapDepartment = { slug: string; name: string; people: number; open: number; late: number };

// The 3D floor of platforms (OrgPlatforms), brought in only here, in the browser:
// three.js stays out of every other page.
const OrgPlatforms = dynamic(() => import("./OrgPlatforms"), {
  ssr: false,
  loading: () => <div className="aspect-[16/9] w-full animate-pulse rounded-2xl border border-white/[0.07] bg-[#0d0f12]" />,
});

export function OrgMap({ departments }: { departments: MapDepartment[] }) {
  const router = useRouter();
  const open = useCallback((slug: string) => router.push(`/org/${slug}`), [router]);
  return <OrgPlatforms departments={departments} onOpen={open} />;
}
