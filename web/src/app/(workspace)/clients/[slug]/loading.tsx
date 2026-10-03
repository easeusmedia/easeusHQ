import { Bone, SkeletonChips, SkeletonPage, SkeletonRows, SkeletonTiles } from "../../Skeleton";

// A client's page while it loads: who they are, their numbers, the tabs and
// the work under them
export default function Loading() {
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
}
