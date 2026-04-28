import type { MetadataRoute } from "next";

import { BASE_PATH } from "@/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zette",
    short_name: "Zette",
    description: "A fount of wisdom drawn from everything you've read.",
    start_url: BASE_PATH || "/",
    scope: BASE_PATH || "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4efe6",
    theme_color: "#f4efe6",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
