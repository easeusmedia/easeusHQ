"use client";

import { createContext, useContext } from "react";

// Everyone's photo address, by name, loaded once in the workspace layout —
// so any avatar anywhere shows the photo without every list having to carry
// it. Keyed by name because that's all an avatar is given; names on the team
// are unique.
const Photos = createContext<Record<string, string>>({});

export function PhotosProvider({ photos, children }: { photos: Record<string, string>; children: React.ReactNode }) {
  return <Photos.Provider value={photos}>{children}</Photos.Provider>;
}

export const usePhoto = (name: string): string | undefined => useContext(Photos)[name];
