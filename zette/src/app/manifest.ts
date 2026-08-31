import type { MetadataRoute } from "next";

import { withBasePath } from "@/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zette",
    short_name: "Zette",
    description: "A fount of wisdom drawn from everything you've read.",
    id: withBasePath("/"),
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5efe6",
    theme_color: "#f5efe6",
    icons: [
      {
        src: withBasePath("/icons/zette-icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/zette-icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/zette-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: withBasePath("/icons/zette-icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
