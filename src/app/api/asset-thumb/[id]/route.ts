import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { repo } from "@/lib/db";

// Thumbnails live outside the user-facing library folders to keep them tidy.
// Layout:   <cwd>/data/thumbs/<assetId>.jpg
const THUMB_ROOT = path.join(process.cwd(), "..", "data", "thumbs");

/**
 * GET /api/asset-thumb/<assetId>
 * Returns a 640-wide JPEG frame extracted from the asset's video. Cached
 * on disk in data/thumbs/. Returns 404 if the asset has no file on disk.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = repo.getAsset(id);
  if (!asset) return new Response("Asset not found", { status: 404 });

  let realPath: string;
  try {
    realPath = fs.realpathSync(asset.path);
  } catch {
    return new Response("Asset file not found", { status: 404 });
  }
  if (!fs.existsSync(realPath)) {
    return new Response("Asset file not found", { status: 404 });
  }

  // Prefer proxy for videos — ffmpeg needs to decode way less data.
  if (asset.kind === "stock_video") {
    const proxyPath = realPath + ".proxy.mp4";
    if (fs.existsSync(proxyPath)) realPath = proxyPath;
  }

  // For photo assets, the file *is* the thumbnail — serve it directly.
  if (asset.kind === "stock_photo") {
    try {
      const buf = fs.readFileSync(realPath);
      const ext = path.extname(realPath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".gif" ? "image/gif" :
        "image/jpeg";
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "private, max-age=300, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(`Photo read failed: ${(err as Error).message}`, { status: 500 });
    }
  }

  fs.mkdirSync(THUMB_ROOT, { recursive: true });
  const thumbPath = path.join(THUMB_ROOT, `${id}.jpg`);

  const needsRegen = (() => {
    if (!fs.existsSync(thumbPath)) return true;
    try {
      return fs.statSync(realPath).mtimeMs > fs.statSync(thumbPath).mtimeMs;
    } catch {
      return true;
    }
  })();

  if (needsRegen) {
    try {
      await extractFrame(realPath, thumbPath, asset.kind === "music");
    } catch (err) {
      return new Response(`ffmpeg failed: ${(err as Error).message}`, { status: 500 });
    }
  }

  try {
    const buf = fs.readFileSync(thumbPath);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(`Read failed: ${(err as Error).message}`, { status: 500 });
  }
}

function extractFrame(realPath: string, outPath: string, isAudio: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    // Audio: render a monochrome waveform PNG via ffmpeg's showwavespic
    // filter. Video: seek ~1.5 s in (avoid leading blacks) then scale.
    const args = isAudio
      ? [
          "-hide_banner", "-loglevel", "error",
          "-i", realPath,
          "-filter_complex", "showwavespic=s=640x240:colors=#00e5a8",
          "-frames:v", "1",
          "-y", outPath,
        ]
      : [
          "-hide_banner", "-loglevel", "error",
          "-ss", "1.5",
          "-i", realPath,
          "-frames:v", "1",
          "-vf", "scale=640:-2",
          "-q:v", "4",
          "-y", outPath,
        ];
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (c) => { stderr += c.toString(); });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve();
      else reject(new Error(`exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}
