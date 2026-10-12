"use client";

import { usePathname } from "next/navigation";
import { Bone, SkeletonChips, SkeletonPage, SkeletonRows, SkeletonTiles, SkeletonTitle } from "./Skeleton";

// Shown the instant a page is clicked, while its data is on the way: without
// it a page shows nothing at all until the full response arrives, which
// reads as a stall. Pages with a shape of their own have their own
// loading.tsx (Skeleton.tsx has the pieces); this is everyone else's.
//
// A client's page is shaped here rather than in its own loading.tsx: one of
// those would flash between clients, and going from one client to the next
// should keep the page in place until the next is ready. This shows only on
// arriving from another section.
export default function Loading() {
  if (/^\/clients\/(?!template$)[^/]+/.test(usePathname()))
    return (
      <SkeletonPage>
        <div className="flex items-center gap-4">
          <Bone className="size-16 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2.5">
            <Bone className="h-6 w-48" />
            <Bone className="h-3.5 w-32" />
          </div>
        </div>
        <SkeletonTiles />
        <SkeletonChips n={5} />
        <SkeletonRows n={6} />
      </SkeletonPage>
    );
  return (
    <SkeletonPage>
      <SkeletonTitle sub />
      <SkeletonRows />
    </SkeletonPage>
  );
}
