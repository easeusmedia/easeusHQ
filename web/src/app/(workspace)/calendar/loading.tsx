import { Bone, SkeletonChips, SkeletonPage, SkeletonTitle } from "../Skeleton";

// The Calendar while it loads: the view switch, the month, and its days
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <SkeletonChips n={2} />
      <SkeletonTitle />
      <div className="panel grid grid-cols-7 gap-px overflow-hidden rounded-3xl p-2">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex h-16 flex-col gap-2 rounded-lg p-2 sm:h-24">
            <Bone className="size-6 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
