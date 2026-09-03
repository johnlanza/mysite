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
    background_color: "#9B6178",
    theme_color: "#9B6178",
    icons: [
      {
        src: withBasePath("/icons/zette-relief-v1-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/zette-relief-v1-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/zette-relief-v1-maskable-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: withBasePath("/icons/zette-relief-v1-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
