"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onPulse } from "./pulseStore";

// Everyone's photo address and who's online right now, by name, loaded once
// in the workspace layout — so any avatar anywhere can show both without
// every list having to carry them. Keyed by name because that's all an
// avatar is given; names on the team are unique. The online dots follow each
// pulse (api/pulse), so someone coming or going never reloads the page.
// `self`: the signed-in person — you know you're online, so your own
// avatars never carry the dot; only other people see it.
type People = { photos: Record<string, string>; online: string[]; self: string };
const PeopleContext = createContext<People>({ photos: {}, online: [], self: "" });

export function PeopleProvider({ photos, online, self, children }: People & { children: React.ReactNode }) {
  const [now, setNow] = useState(online);
  // a page refresh brings its own list: that one, until the next pulse
  const [given, setGiven] = useState(online);
  if (given !== online) {
    setGiven(online);
    setNow(online);
  }
  useEffect(() => onPulse((d) => d.online && setNow(d.online)), []);
  return <PeopleContext.Provider value={{ photos, online: now, self }}>{children}</PeopleContext.Provider>;
}

export const usePhoto = (name: string): string | undefined => useContext(PeopleContext).photos[name];
export const useOnline = (name: string): boolean => {
  const { online, self } = useContext(PeopleContext);
  return name !== self && online.includes(name);
};
