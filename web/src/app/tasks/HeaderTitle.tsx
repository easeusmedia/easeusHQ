"use client";

import { createContext, useContext, useEffect, useState } from "react";

const Ctx = createContext<{ title: string | null; setTitle: (t: string | null) => void } | null>(null);

// A page announces its own header title instead of the layout guessing it
// from the URL — the only way a dynamic one (a client's name, a project's
// name) can reach the header without either prop-drilling through every
// layout or fetching that data a second time up there.
export function HeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <Ctx.Provider value={{ title, setTitle }}>{children}</Ctx.Provider>;
}

function useHeaderTitleCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("HeaderTitleProvider is missing above this component.");
  return ctx;
}

export function useHeaderTitle() {
  return useHeaderTitleCtx().title;
}

// Rendered by each page, not visible itself — announces this page's title
// on mount and clears it on unmount, so navigating away doesn't leave a
// stale title showing while the next page's own effect hasn't run yet
// (the header falls back to a pathname-derived guess in that gap instead).
export function SetHeaderTitle({ title }: { title: string }) {
  const { setTitle } = useHeaderTitleCtx();
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
  return null;
}
