"use server";
import { revalidatePath } from "next/cache";
import path from "node:path";
import fs from "node:fs";
import { repo } from "@/lib/db";
import type { AssetKind } from "@/lib/types";

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"]);
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".tif", ".tiff"]);

function allowedExtFor(kind: AssetKind): Set<string> {
  switch (kind) {
    case "music":       return AUDIO_EXT;
    case "stock_photo": return PHOTO_EXT;
    case "stock_video":
    default:            return VIDEO_EXT;
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export async function rescanLibraryAction(kind: AssetKind) {
  const settings = repo.getSettings();
  const base = kind === "music" ? settings.music_path : settings.stock_path;
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

  const allowed = allowedExtFor(kind);
  const existing = new Set(repo.listAssets(kind).map((a) => a.path));
  const files = walk(base);
  let added = 0;

  for (const file of files) {
    if (existing.has(file)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!allowed.has(ext)) continue;
    // Skip the proxy MP4s that we generate next to Freepik masters —
    // they live as `<master>.proxy.mp4` and shouldn't show as separate
    // library entries.
    if (file.endsWith(".proxy.mp4")) continue;

    const stat = fs.statSync(file);
    const rel = path.relative(base, file);
    const parts = rel.split(path.sep).slice(0, -1);

    // Also derive tags from the filename tokens (e.g. "programador-tecleando-codigo" → [programador, tecleando, codigo])
    const baseName = path.basename(file, path.extname(file));
    const tokenTags = baseName
      .toLowerCase()
      .split(/[-_\s.]+/)
      .filter((t) => t.length >= 3);
    const tags = Array.from(new Set([...parts, ...tokenTags]));

    // Probe duration (best-effort, ignore errors)
    let duration: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    try {
      const { probeVideo } = await import("@/lib/pipeline/ffprobe");
      const meta = await probeVideo(file);
      duration = meta.duration_sec;
      width = meta.width;
      height = meta.height;
    } catch {
      /* ignore */
    }

    repo.createAsset({
      kind,
      path: file,
      filename: path.basename(file),
      tags,
      duration_sec: duration,
      width,
      height,
      size_bytes: stat.size,
      notes: null,
    });
    added++;
  }

  revalidatePath("/stock");
  revalidatePath("/fotos");
  revalidatePath("/musica");
  return { added, total: files.length };
}

export async function updateAssetTagsAction(id: string, tags: string[]) {
  repo.updateAssetTags(id, tags);
  revalidatePath("/stock");
  revalidatePath("/fotos");
  revalidatePath("/musica");
}

export async function deleteAssetAction(id: string) {
  repo.deleteAsset(id);
  revalidatePath("/stock");
  revalidatePath("/fotos");
  revalidatePath("/musica");
}
