import { SkeletonPage, SkeletonRows, SkeletonTitle } from "./Skeleton";

// Shown the instant a page is clicked, while its data is on the way: without
// it a page shows nothing at all until the full response arrives, which
// reads as a stall. Pages with a shape of their own have their own
// loading.tsx (Skeleton.tsx has the pieces); this is everyone else's.
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle sub />
      <SkeletonRows />
    </SkeletonPage>
  );
}
