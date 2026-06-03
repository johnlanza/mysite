import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const rawBasePath = (
  process.env.NEXT_PUBLIC_POOLARAMA_BASE_PATH ||
  process.env.NEXT_PUBLIC_BASE_PATH ||
  ""
).trim();
const basePath =
  rawBasePath && rawBasePath !== "/"
    ? `${rawBasePath.startsWith("/") ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, "")
    : "";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.68.102"],
  typedRoutes: true,
  turbopack: {
    root: rootDir
  }
};

export default nextConfig;
