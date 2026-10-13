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
// `names` and `departments`: everyone's and every department's name by id,
// so a task's window can say who made it and where it's filed the moment it
// opens, without asking the server.
type People = { photos: Record<string, string>; online: string[]; self: string; names: Record<string, string>; departments: Record<string, string> };
const PeopleContext = createContext<People>({ photos: {}, online: [], self: "", names: {}, departments: {} });

export function PeopleProvider({ photos, online, self, names, departments, children }: People & { children: React.ReactNode }) {
  const [now, setNow] = useState(online);
  // a page refresh brings its own list: that one, until the next pulse
  const [given, setGiven] = useState(online);
  if (given !== online) {
    setGiven(online);
    setNow(online);
  }
  useEffect(() => onPulse((d) => d.online && setNow(d.online)), []);
  return <PeopleContext.Provider value={{ photos, online: now, self, names, departments }}>{children}</PeopleContext.Provider>;
}

export const useNameOf = (id: string | null | undefined): string | null => {
  const { names } = useContext(PeopleContext);
  return (id && names[id]) || null;
};
export const useDepartmentName = (id: string | null | undefined): string | null => {
  const { departments } = useContext(PeopleContext);
  return (id && departments[id]) || null;
};

export const usePhoto = (name: string): string | undefined => useContext(PeopleContext).photos[name];
export const useOnline = (name: string): boolean => {
  const { online, self } = useContext(PeopleContext);
  return name !== self && online.includes(name);
};
