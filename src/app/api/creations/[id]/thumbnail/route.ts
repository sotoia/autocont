import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { repo } from "@/lib/db";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const UPLOAD_SUBDIR = "uploads/thumbnails";
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * POST /api/creations/<id>/thumbnail
 * FormData con campo "file" (imagen). Guarda en /public/uploads/thumbnails/<id>.<ext>
 * y actualiza creations.thumbnail_path. Devuelve { creation }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const creation = repo.getCreation(id);
  if (!creation) return Response.json({ error: "Creación no encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No se recibió archivo en el campo 'file'" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "La imagen pesa más de 8MB" }, { status: 413 });
  }

  const origName = file.name || "thumb";
  const ext = (path.extname(origName) || ".jpg").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return Response.json({ error: `Extensión no permitida (${ext})` }, { status: 415 });
  }

  const dir = path.join(PUBLIC_DIR, UPLOAD_SUBDIR);
  await fs.mkdir(dir, { recursive: true });

  // Si ya había una mini previa con extensión distinta, la borramos para no dejar huérfanos.
  if (creation.thumbnail_path) {
    const prevAbs = path.join(PUBLIC_DIR, creation.thumbnail_path.replace(/^\/+/, ""));
    if (prevAbs.startsWith(PUBLIC_DIR)) {
      try { await fs.unlink(prevAbs); } catch { /* ignore */ }
    }
  }

  const filename = `${id}${ext}`;
  const absPath = path.join(dir, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);

  // Path relativo a /public + cache-buster para que el <img> recargue al sobrescribir.
  const relPath = `/${UPLOAD_SUBDIR}/${filename}?v=${Date.now()}`;
  const updated = repo.updateCreation(id, { thumbnail_path: relPath });
  return Response.json({ creation: updated });
}

/**
 * DELETE /api/creations/<id>/thumbnail — elimina la miniatura asociada.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const creation = repo.getCreation(id);
  if (!creation) return Response.json({ error: "Creación no encontrada" }, { status: 404 });
  if (creation.thumbnail_path) {
    const abs = path.join(PUBLIC_DIR, creation.thumbnail_path.replace(/^\/+/, "").split("?")[0]);
    if (abs.startsWith(PUBLIC_DIR)) {
      try { await fs.unlink(abs); } catch { /* ignore */ }
    }
  }
  const updated = repo.updateCreation(id, { thumbnail_path: "" });
  return Response.json({ creation: updated });
}
