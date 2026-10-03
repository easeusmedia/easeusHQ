import { SkeletonChips, SkeletonPage, SkeletonRows, SkeletonTitle } from "../Skeleton";

// My tasks while it loads: the heading, the filters and the list
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <SkeletonTitle sub />
      <SkeletonChips n={5} />
      <SkeletonRows n={6} title={false} className="pt-3" />
    </SkeletonPage>
  );
}
