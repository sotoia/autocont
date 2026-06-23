import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["better-sqlite3", "chokidar", "fsevents"],
  // standalone — copia el server + sus deps a .next/standalone/. Necesario
  // para que el wrapper Electron pueda spawnear `node server.js` sin
  // depender de toda la carpeta del proyecto.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
