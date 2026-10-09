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
    // Safari's Add to Dock (and Chrome) take the plain icons as they are,
    // so they're already the Mac's rounded shape, with no rim of their own
    // (the site's icon has one, which showed as a second edge); Chrome
    // offers to install only with both sizes. A full square for anything
    // that rounds icons itself.
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icon.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
