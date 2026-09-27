import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // files attached for the contract assistant ride in the action's body —
    // up to 4MB of them, within Vercel's 4.5MB request limit
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
