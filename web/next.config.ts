import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Every page used to live under /tasks (/tasks/clients, /tasks/my…). Each
  // now has its own address; old links and bookmarks still land in the
  // right place. Temporary (307) so nothing caches a mapping forever.
  async redirects() {
    return [
      { source: "/tasks", destination: "/board", permanent: false },
      { source: "/tasks/my", destination: "/my-tasks", permanent: false },
      { source: "/tasks/users", destination: "/people", permanent: false },
      { source: "/tasks/:path*", destination: "/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
