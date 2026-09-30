import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // ffmpeg takes the feedback snapshots (lib/snapshots.ts): kept as a real
  // package so it finds its own binary, and the binary shipped with every
  // function that syncs Frame.io
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/performance": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/performance/[id]": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/cron/analytics": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  experimental: {
    // files attached for the contract assistant ride in the action's body —
    // up to 4MB of them, within Vercel's 4.5MB request limit
    serverActions: { bodySizeLimit: "4.5mb" },
    // A page you've just been on opens straight from memory for 30s rather
    // than asking the server again; the pulse still refreshes the page in
    // front of you the moment anything changes (see Pulse.tsx).
    // A page loaded ahead on hover (PrefetchLink) is kept as long — not the
    // default five minutes, which would show a busy board out of date.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
