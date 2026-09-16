"use client";

import { createContext, useContext } from "react";

// Everyone's photo address and who's online right now, by name, loaded once
// in the workspace layout — so any avatar anywhere can show both without
// every list having to carry them. Keyed by name because that's all an
// avatar is given; names on the team are unique. It's refreshed with the
// rest of the page every few seconds (LiveRefresh), which is what keeps the
// online dots current.
// `self`: the signed-in person — you know you're online, so your own
// avatars never carry the dot; only other people see it.
type People = { photos: Record<string, string>; online: string[]; self: string };
const PeopleContext = createContext<People>({ photos: {}, online: [], self: "" });

export function PeopleProvider({ photos, online, self, children }: People & { children: React.ReactNode }) {
  return <PeopleContext.Provider value={{ photos, online, self }}>{children}</PeopleContext.Provider>;
}

export const usePhoto = (name: string): string | undefined => useContext(PeopleContext).photos[name];
export const useOnline = (name: string): boolean => {
  const { online, self } = useContext(PeopleContext);
  return name !== self && online.includes(name);
};
