import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["better-sqlite3", "chokidar", "fsevents"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
