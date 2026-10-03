import { SkeletonBoard, SkeletonChips, SkeletonPage, SkeletonTitle } from "../../Skeleton";

// A department or one of its portals while it loads: the title, the row of
// choices, and the board's stages with cards under them
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <SkeletonTitle />
      <SkeletonChips n={3} />
      <SkeletonBoard />
    </SkeletonPage>
  );
}
