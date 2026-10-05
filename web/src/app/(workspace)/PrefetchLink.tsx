"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// A link that loads its whole page the moment you show you're heading there
// (the pointer on it, focus, a touch), so by the click it's already here.
// Until then, nothing: Next's default fetched every visible link's page
// frame in the background, again every 30s, and the sidebar, client bar and
// lists made thousands of server calls a day nobody asked for (Vercel's free
// CPU and invocations). Every internal link in the app is this one.
export function PrefetchLink({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [hot, setHot] = useState(false);
  return (
    <Link
      {...props}
      prefetch={hot}
      onMouseEnter={(e) => {
        setHot(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setHot(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setHot(true);
        onTouchStart?.(e);
      }}
    />
  );
}
