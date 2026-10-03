import { SkeletonPage, SkeletonRows, SkeletonTiles, SkeletonTitle } from "../Skeleton";

// This page while it loads: its heading, its numbers, and the list under them
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle sub />
      <SkeletonTiles />
      <SkeletonRows />
    </SkeletonPage>
  );
}
