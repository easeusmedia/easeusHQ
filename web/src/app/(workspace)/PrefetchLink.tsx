"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// A link that loads its whole page the moment you show you're heading there
// (the pointer on it, focus, a touch), so by the click it's already here.
// Until then, the usual: only the page's frame, once it scrolls into view.
export function PrefetchLink({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [hot, setHot] = useState(false);
  return (
    <Link
      {...props}
      prefetch={hot ? true : null}
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
