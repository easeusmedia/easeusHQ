import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { DRIVE_SETTINGS } from "./drive";

// easeus.media@gmail.com's Google Calendar: its meetings on Home, and the
// town halls and group meetings made there, with a Meet link and invites.
// Connected under Integrations with the same Google app Drive uses, as its
// own connection (like Gmail's).

export const CALENDAR_SETTINGS = { refreshToken: "calendar.refreshToken", account: "calendar.account" } as const;

async function settings() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [CALENDAR_SETTINGS.refreshToken, CALENDAR_SETTINGS.account, DRIVE_SETTINGS.clientId, DRIVE_SETTINGS.clientSecret] } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// the connected address, or null when there's no connection
export async function calendarAccount(): Promise<string | null> {
  const s = await settings();
  return s[CALENDAR_SETTINGS.refreshToken] ? (s[CALENDAR_SETTINGS.account] ?? "") : null;
}

let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const s = await settings();
  const refresh = s[CALENDAR_SETTINGS.refreshToken];
  if (!refresh) throw new Error("Google Calendar isn't connected.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s[DRIVE_SETTINGS.clientId] ?? "",
      client_secret: s[DRIVE_SETTINGS.clientSecret] ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't refresh the Calendar connection.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function calendar<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Google Calendar answered ${res.status}.`);
  return body as T;
}

export type Meeting = {
  id: string;
  title: string;
  // ISO; an all-day event's start is its day at midnight IST
  start: string;
  end: string;
  allDay: boolean;
  meet: string | null;
  link: string | null;
  people: number;
};

type GEvent = {
  id: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
};

const toMeeting = (e: GEvent): Meeting => ({
  id: e.id,
  title: e.summary || "Busy",
  start: e.start.dateTime ?? `${e.start.date}T00:00:00+05:30`,
  end: e.end.dateTime ?? `${e.end.date}T00:00:00+05:30`,
  allDay: !e.start.dateTime,
  meet: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null,
  link: e.htmlLink ?? null,
  people: e.attendees?.length ?? 0,
});

// Every meeting between two moments, in order, repeats unrolled.
// Home asks on every render and every live refresh, and Google takes a few
// hundred milliseconds to answer, so a week's list is held for a minute, in
// Next's shared cache (every server instance reads the same one). A meeting
// made here clears it at once (MEETINGS_TAG, home/actions.ts); one made in
// Google Calendar itself shows within the minute.
export const MEETINGS_TAG = "meetings";
const weekOf = unstable_cache(
  async (from: string, to: string): Promise<Meeting[]> => {
    const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const body = await calendar<{ items?: GEvent[] }>(`events?${q}`);
    return (body.items ?? []).filter((e) => e.status !== "cancelled").map(toMeeting);
  },
  ["calendar-week"],
  { revalidate: 60, tags: [MEETINGS_TAG] },
);
export const listMeetings = (from: Date, to: Date): Promise<Meeting[]> => weekOf(from.toISOString(), to.toISOString());

// A meeting on the calendar, with a Meet link, and an invite to each person
export async function createMeeting(input: { title: string; start: Date; end: Date; attendees: string[]; description?: string }): Promise<Meeting> {
  const body = await calendar<GEvent>("events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    body: JSON.stringify({
      summary: input.title,
      description: input.description || undefined,
      start: { dateTime: input.start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: input.end.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: input.attendees.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  return toMeeting(body);
}
