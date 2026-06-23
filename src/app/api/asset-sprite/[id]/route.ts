import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { repo } from "@/lib/db";

// Horizontal strip of N frames for scrub-preview. Cached at data/sprites/<id>.jpg
// so we only run ffmpeg once per asset.
const SPRITE_ROOT = path.join(process.cwd(), "..", "data", "sprites");
const FRAMES = 24;
const FRAME_W = 240;
const FRAME_H = 135;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = repo.getAsset(id);
  if (!asset) return new Response("Asset not found", { status: 404 });

  let realPath: string;
  try { realPath = fs.realpathSync(asset.path); } catch { return new Response("not found", { status: 404 }); }
  if (!fs.existsSync(realPath)) return new Response("not found", { status: 404 });

  // Prefer a browser-safe H.264 proxy when one exists so ffmpeg's tile
  // filter doesn't have to decode 4K ProRes masters every time.
  const proxyPath = realPath + ".proxy.mp4";
  if (fs.existsSync(proxyPath)) realPath = proxyPath;

  fs.mkdirSync(SPRITE_ROOT, { recursive: true });
  const spritePath = path.join(SPRITE_ROOT, `${id}.jpg`);

  const needsRegen = (() => {
    if (!fs.existsSync(spritePath)) return true;
    try {
      return fs.statSync(realPath).mtimeMs > fs.statSync(spritePath).mtimeMs;
    } catch { return true; }
  })();

  if (needsRegen) {
    try {
      await buildSprite(realPath, spritePath, asset.duration_sec ?? 0);
    } catch (err) {
      return new Response(`ffmpeg failed: ${(err as Error).message}`, { status: 500 });
    }
  }

  try {
    const buf = fs.readFileSync(spritePath);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
        "Access-Control-Allow-Origin": "*",
        // So the addon knows the layout without a second request.
        "X-Sprite-Frames": String(FRAMES),
        "X-Sprite-Frame-Width": String(FRAME_W),
        "X-Sprite-Frame-Height": String(FRAME_H),
      },
    });
  } catch (err) {
    return new Response(`read failed: ${(err as Error).message}`, { status: 500 });
  }
}

function buildSprite(srcPath: string, outPath: string, durationSec: number): Promise<void> {
  // When we know the duration, sample FRAMES frames evenly across the clip.
  // Otherwise fall back to 2 fps which is fine for short stock clips.
  const duration = durationSec > 0.5 ? durationSec : 12;
  // Pick one frame every `duration / FRAMES` seconds. Cap fps at 30 so ffmpeg
  // doesn't get asked to decode every single frame of a long clip.
  const targetFps = Math.min(30, FRAMES / duration);
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-i", srcPath,
      "-vf", `fps=${targetFps.toFixed(4)},scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H},tile=${FRAMES}x1`,
      "-frames:v", "1",
      "-q:v", "4",
      "-y",
      outPath,
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
