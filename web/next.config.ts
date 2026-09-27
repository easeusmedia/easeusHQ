import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // files attached for the contract assistant ride in the action's body —
    // up to 4MB of them, within Vercel's 4.5MB request limit
    serverActions: { bodySizeLimit: "4.5mb" },
    // A page you've just been on opens straight from memory for 30s rather
    // than asking the server again; the pulse still refreshes the page in
    // front of you the moment anything changes (see Pulse.tsx).
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
