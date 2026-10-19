"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { worksDepartment } from "@/lib/scope";
import { freshenLeadChannel, type ChannelStats } from "@/lib/leadChannel";

// What the lead window calls when it opens a lead: the channel's numbers as
// they stand, a read started in the background when they're over a day old
// (lib/leadChannel.ts), and whether one is under way. While `reading`, call
// it again every 20 seconds or so to see when the call-back has saved it. Reads spend Apify credit on the live
// site only; on localhost the numbers simply stay as they are.
export async function openLeadChannel(leadId: string): Promise<{ channel: ChannelStats | null; channelAt: string | null; reading: boolean } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has ended. Please sign in again." };
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { board: { select: { teamId: true } } } });
  if (!lead || !worksDepartment(viewer, lead.board.teamId)) return { error: "That lead isn't in a department you work in." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : undefined;
  // a finished read is saved by its call-back (and the nightly collect), not here:
  // actions run one at a time, so a slow collect held up every tap meanwhile
  const state = await freshenLeadChannel(leadId, origin);
  return { channel: state.channel, channelAt: state.channelAt?.toISOString() ?? null, reading: state.reading };
}
