"use client";

import { useSearchParams } from "next/navigation";
import { Bone, SkeletonPage, SkeletonTitle } from "../Skeleton";
import { ListBones } from "./PersonWork";

// This page while it loads, in the shape of whichever it's opening: the
// people's cards, each with a few task rows in it; or one
// person (?person=), their heading, the two tabs, and a list
export default function Loading() {
  const person = useSearchParams().has("person");
  if (person) {
    return (
      <SkeletonPage className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Bone className="h-4 w-24" />
          <div className="flex items-center gap-4">
            <Bone className="size-14 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2.5">
              <Bone className="h-7 w-48" />
              <Bone className="h-3.5 w-28" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex gap-6 border-b border-border pb-3">
            <Bone className="h-4 w-28" />
            <Bone className="h-4 w-32" />
          </div>
          <ListBones n={7} />
        </div>
      </SkeletonPage>
    );
  }
  return (
    <SkeletonPage className="flex flex-col gap-8">
      <SkeletonTitle />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl panel-soft p-4">
            <div className="flex items-center gap-3">
              <Bone className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Bone className="h-3.5 w-32" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-3.5 w-8 shrink-0" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Bone className="h-3 w-24" />
              <div className="divide-y divide-border">
                {Array.from({ length: 3 - (i % 3) }, (_, j) => (
                  <div key={j} className="flex items-center gap-3 py-2">
                    <Bone className="size-7 shrink-0 rounded-md" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Bone className={`h-3.5 ${j === 1 ? "w-3/5" : "w-4/5"}`} />
                      <Bone className="h-3 w-24" />
                    </div>
                    <Bone className="h-3 w-12 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
