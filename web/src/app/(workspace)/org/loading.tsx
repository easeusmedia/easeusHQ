import { SkeletonCards, SkeletonPage, SkeletonTitle } from "../Skeleton";

// Organization while it loads: its heading and a panel a department
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonCards n={6} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
    </SkeletonPage>
  );
}
