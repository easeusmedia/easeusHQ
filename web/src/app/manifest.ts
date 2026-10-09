import type { MetadataRoute } from "next";

// What a browser installs as an app (Safari: File > Add to Dock): its name,
// its own window without the browser's bars, the app's dark behind it, and
// the Easeus icon. Installed from app.easeus.media, it opens app.easeus.media.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Easeus HQ",
    short_name: "Easeus HQ",
    description: "The Easeus Media team workspace",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    // Chrome offers to install only with both sizes; the Mac's Dock (Safari)
    // takes a full square with no corners or rim of its own, and rounds it
    // to the Mac's shape itself
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icon.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
