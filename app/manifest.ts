import type { MetadataRoute } from "next";

// PWA manifest — lets phones "Add to Home Screen" and open pi-web as a
// standalone app (no browser chrome), which is the main way a remote
// (Tailscale/tunnel) user lives in it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pi web — coding agent",
    short_name: "pi web",
    description: "Web UI for the pi coding agent",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a1d",
    theme_color: "#0c0a1d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
