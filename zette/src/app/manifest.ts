import type { MetadataRoute } from "next";

import {
  ZETTE_ICON_BACKGROUND_COLOR,
  ZETTE_ICON_THEME_COLOR,
  withIconVersion,
} from "@/lib/icon-config";
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
    background_color: ZETTE_ICON_BACKGROUND_COLOR,
    theme_color: ZETTE_ICON_THEME_COLOR,
    icons: [
      {
        src: withBasePath(withIconVersion("/icons/zette-icon-192.png")),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath(withIconVersion("/icons/zette-icon-512.png")),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath(withIconVersion("/icons/zette-maskable-512.png")),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
