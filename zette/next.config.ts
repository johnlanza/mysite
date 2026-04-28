import path from "node:path";
import type { NextConfig } from "next";

const rawBasePath = (
  process.env.NEXT_PUBLIC_ZETTE_BASE_PATH ||
  process.env.NEXT_PUBLIC_BASE_PATH ||
  ""
).trim();
const basePath =
  rawBasePath && rawBasePath !== "/"
    ? `${rawBasePath.startsWith("/") ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, "")
    : "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
