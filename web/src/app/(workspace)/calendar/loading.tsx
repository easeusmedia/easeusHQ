import { Bone, SkeletonChips, SkeletonPage, SkeletonTitle } from "../Skeleton";

// The Calendar while it loads: the view switch, the month, and its days
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <SkeletonChips n={2} />
      <SkeletonTitle sub />
      <div className="panel grid grid-cols-7 gap-px overflow-hidden rounded-2xl p-2">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex h-24 flex-col gap-2 rounded-lg p-2">
            <Bone className="h-3 w-5" />
            {i % 4 === 1 && <Bone className="h-4 w-4/5 rounded-full" />}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
