import { SkeletonCards, SkeletonChips, SkeletonPage } from "../Skeleton";

// The Clients list while it loads: its tabs and a card a client
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <SkeletonChips n={3} />
      <SkeletonCards n={9} className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4" />
    </SkeletonPage>
  );
}
