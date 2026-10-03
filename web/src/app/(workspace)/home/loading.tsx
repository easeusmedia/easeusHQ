import { Bone, SkeletonPage, SkeletonRows } from "../Skeleton";

// Home's shape while it loads: the greeting, the work down the left, and
// tasks, the week and notices down the right
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Bone className="h-3 w-20" />
        <Bone className="h-8 w-72 max-w-[70vw]" />
        <Bone className="h-3.5 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <SkeletonRows n={8} />
        <div className="flex flex-col gap-4">
          <SkeletonRows n={2} />
          <SkeletonRows n={1} />
          <SkeletonRows n={3} />
        </div>
      </div>
    </SkeletonPage>
  );
}
