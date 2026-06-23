import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  let requested = url.searchParams.get("path") || os.homedir();
  requested = path.resolve(requested);

  try {
    const stat = await fs.promises.stat(requested);
    if (!stat.isDirectory()) {
      return Response.json({ error: "No es un directorio" }, { status: 400 });
    }
    const entries = await fs.promises.readdir(requested, { withFileTypes: true });

    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => {
        let isDirectory = e.isDirectory();
        if (e.isSymbolicLink()) {
          try {
            const real = fs.statSync(path.join(requested, e.name));
            isDirectory = real.isDirectory();
          } catch {
            isDirectory = false;
          }
        }
        return {
          name: e.name,
          path: path.join(requested, e.name),
          isDirectory,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      });

    const parent = path.dirname(requested);
    const isRoot = requested === parent;

    return Response.json({
      path: requested,
      parent: isRoot ? null : parent,
      items,
      shortcuts: [
        { name: "Inicio", path: os.homedir() },
        { name: "Escritorio", path: path.join(os.homedir(), "Desktop") },
        { name: "Documentos", path: path.join(os.homedir(), "Documents") },
        { name: "Descargas", path: path.join(os.homedir(), "Downloads") },
        { name: "Películas", path: path.join(os.homedir(), "Movies") },
        { name: "Música", path: path.join(os.homedir(), "Music") },
      ],
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message, path: requested },
      { status: 404 }
    );
  }
}
